import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps, cert, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import multer from 'multer';

const upload = multer({ 
  limits: { fileSize: 50 * 1024 * 1024 } // 50MB limit for file uploads
});

import fs from 'fs';

let firebaseConfig: any = {};
try {
  const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
  if (fs.existsSync(configPath)) {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  }
} catch (e) {}

// Initialize Firebase Admin
if (!getApps().length) {
  if (process.env.FIREBASE_SERVICE_ACCOUNT) {
    let serviceAccount;
    try {
      // Try to parse as raw JSON first (if the user pasted the JSON directly)
      serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT);
    } catch (e) {
      // Fallback: decode from base64
      serviceAccount = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT, 'base64').toString('utf8'));
    }
    initializeApp({
      credential: cert(serviceAccount),
      projectId: serviceAccount.project_id || firebaseConfig.projectId,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id || firebaseConfig.projectId}.appspot.com`
    });
  } else {
    // Uses Application Default Credentials locally in AI Studio
    initializeApp({
      credential: applicationDefault(),
      projectId: firebaseConfig.projectId || 'gen-lang-client-0026791312',
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${firebaseConfig.projectId || 'gen-lang-client-0026791312'}.appspot.com`
    });
  }
}

// In some Firebase configurations (like AI Studio previews), the database has a specific ID
const dbId = firebaseConfig.firestoreDatabaseId || 'ai-studio-webscraperarchiv-7efb3937-e03f-49a6-b9dc-a62dc967ef32';
const db = dbId ? getFirestore(dbId) : getFirestore();
const bucket = getStorage().bucket();

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json({ limit: '50mb' }));

  // Helper to check authorization (admin override via secret header)
  const isAuthorized = (req: express.Request, entry: any) => {
    const isAdmin = req.headers['x-admin-secret'] === 'mbsczhyzbxX&7';
    return !entry.isPublished || isAdmin;
  };

  // API endpoint to scrape a website
  app.post('/api/scrape', async (req, res) => {
    const { url, cookie, customName } = req.body;
    const maxDepth = req.body.depth || 1;
    const MAX_PAGES = 15;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    try {
      let requestHeaders: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
      };
      
      // Parse custom cookie string or raw headers JSON payload
      if (cookie) {
        try {
          const parsed = JSON.parse(cookie);
          if (parsed.requestHeaders && Array.isArray(parsed.requestHeaders.headers)) {
            parsed.requestHeaders.headers.forEach((h: any) => {
              if (h.name && h.value) requestHeaders[h.name] = h.value;
            });
          } else if (Array.isArray(parsed)) {
            parsed.forEach((h: any) => {
              if (h.name && h.value) requestHeaders[h.name] = h.value;
            });
          } else {
            requestHeaders = { ...requestHeaders, ...parsed };
          }
        } catch (e) {
          // If it's not JSON, assume it's just a raw cookie string
          requestHeaders['Cookie'] = cookie;
        }
      }

      const links: any[] = [];
      const seenLinks = new Set<string>();
      const visitedUrls = new Set<string>();
      
      const queue: { targetUrl: string; currentDepth: number }[] = [
        { targetUrl: url, currentDepth: 0 }
      ];
      
      const baseUrlOrigin = new URL(url).origin;
      let pagesScraped = 0;

      while (queue.length > 0 && pagesScraped < MAX_PAGES) {
        const { targetUrl, currentDepth } = queue.shift()!;
        
        const normalizedTarget = targetUrl.split('#')[0];
        if (visitedUrls.has(normalizedTarget)) continue;
        visitedUrls.add(normalizedTarget);
        
        pagesScraped++;

        try {
          const response = await axios.get(normalizedTarget, { 
            headers: requestHeaders, 
            timeout: 10000,
            maxContentLength: 5000000 // Stop fetching if it's a huge binary file > 5MB
          });
          
          const contentType = response.headers['content-type'] || '';
          if (!contentType.includes('text/html')) {
            continue; // Skip parsing non-HTML files
          }
          
          const html = response.data;
          
          if (typeof html !== 'string') continue;
          
          const $ = cheerio.load(html);

          // Sakai and other institutional portals use iframes heavily.
          // Parse them as part of the current depth level.
          $('iframe, frame').each((_, el) => {
            const src = $(el).attr('src');
            if (src) {
              try {
                const absoluteSrc = new URL(src, normalizedTarget).href;
                queue.push({ targetUrl: absoluteSrc, currentDepth });
              } catch (e) {}
            }
          });

          // Extract all anchor tags
          $('a').each((_, el) => {
            const href = $(el).attr('href');
            let text = $(el).text().trim() || 'No text content';
            
            if (href && !href.startsWith('javascript:') && !href.startsWith('mailto:') && !href.startsWith('#')) {
              try {
                // Resolve relative URLs to absolute URLs
                const absoluteUrl = new URL(href, normalizedTarget).href;
                const absoluteUrlNoHash = absoluteUrl.split('#')[0];
                
                const lowerUrl = absoluteUrlNoHash.toLowerCase();
                const textLower = text.toLowerCase();
                
                // Enhanced file detection for institutional LMS (e.g. Sakai eFundi)
                const isPdfExtension = lowerUrl.endsWith('.pdf') || textLower.includes('.pdf');
                const isSakaiFile = lowerUrl.includes('/access/content/') && !lowerUrl.endsWith('/');
                const isOtherFile = lowerUrl.match(/\.(doc|docx|ppt|pptx|xls|xlsx|zip|rar|txt)$/i);
                
                let type: 'pdf' | 'link' | 'image' | 'other' = 'link';
                if (isPdfExtension || (isSakaiFile && (lowerUrl.includes('.pdf') || textLower.includes('.pdf')))) {
                  type = 'pdf';
                } else if (isSakaiFile || isOtherFile) {
                  type = 'other';
                }

                if (!seenLinks.has(absoluteUrlNoHash)) {
                  seenLinks.add(absoluteUrlNoHash);
                  links.push({ text, href: absoluteUrlNoHash, type });
                }

                // If it's a standard link and we haven't reached max depth, add to crawler queue
                if (type === 'link' && currentDepth < maxDepth) {
                  if (absoluteUrlNoHash.startsWith(baseUrlOrigin)) {
                    queue.push({ targetUrl: absoluteUrlNoHash, currentDepth: currentDepth + 1 });
                  }
                }
              } catch (e) {
                // Ignore malformed URLs
              }
            }
          });
        } catch (err: any) {
          console.error(`Failed to fetch ${normalizedTarget}: ${err.message}`);
        }
      }
      
      const scrapeId = Date.now().toString();
      
      // Auto-download files using the authenticated session and upload them to Firebase Storage
      // so users don't need to log in to the original site to download them.
      for (let i = 0; i < links.length; i++) {
        const link = links[i];
        if (link.type === 'pdf' || link.type === 'other') {
          try {
            const fileResponse = await axios.get(link.href, {
              headers: requestHeaders,
              responseType: 'arraybuffer',
              timeout: 20000,
              maxContentLength: 50 * 1024 * 1024 // 50MB limit
            });
            
            const contentType = fileResponse.headers['content-type'] || 'application/octet-stream';
            
            // Extract a reasonable file name
            let fileName = link.href.split('/').pop() || 'file';
            fileName = fileName.split('?')[0]; // Remove query params
            if (fileName.length > 50) fileName = fileName.substring(fileName.length - 50);
            if (!fileName.includes('.')) {
               fileName += link.type === 'pdf' ? '.pdf' : '.bin';
            }
            
            const storageFilePath = `scraped_files/${scrapeId}/${Date.now()}_${fileName}`;
            const storageFile = bucket.file(storageFilePath);
            
            await storageFile.save(fileResponse.data, {
              metadata: { contentType }
            });
            
            // Generate a long-lived signed URL instead of using makePublic (which fails on uniform bucket-level access)
            const [signedUrl] = await storageFile.getSignedUrl({
              action: 'read',
              expires: '01-01-2100' // Far future expiration
            });
            
            // Overwrite the href with the public cloud URL
            link.originalHref = link.href;
            link.href = signedUrl;
            
          } catch (fileErr: any) {
            console.error(`Failed to auto-download file at ${link.href}:`, fileErr.message);
            // If it fails, keep the original link.href
          }
        }
      }

      const entry = {
        id: scrapeId,
        url,
        customName: customName || url,
        timestamp: new Date().toISOString(),
        links,
        status: 'success',
        isPublished: false
      };

      await db.collection('archives').doc(entry.id).set(entry);
      res.json(entry);
      
    } catch (error: any) {
      const errorEntry = {
        id: Date.now().toString(),
        url,
        customName: customName || url,
        timestamp: new Date().toISOString(),
        links: [],
        status: 'error',
        errorMessage: error.message || 'Failed to fetch the URL'
      };
      
      await db.collection('archives').doc(errorEntry.id).set(errorEntry);
      res.status(500).json(errorEntry);
    }
  });

  // API endpoint to fetch history from Firebase
  app.get('/api/history', async (req, res) => {
    try {
      const snapshot = await db.collection('archives').orderBy('timestamp', 'desc').get();
      const entries = snapshot.docs.map(doc => doc.data());
      res.json(entries);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API endpoint to delete an entry
  app.delete('/api/history/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const docRef = db.collection('archives').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'Not found' });
      }
      
      const entry = doc.data();
      if (!isAuthorized(req, entry)) {
         return res.status(403).json({ error: 'Cannot modify a published archive' });
      }
      
      await docRef.delete();
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API endpoint to rename an entry
  app.patch('/api/history/:id/name', async (req, res) => {
    const { id } = req.params;
    const { customName } = req.body;
    try {
      const docRef = db.collection('archives').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'Not found' });
      }
      
      const entry = doc.data();
      if (!isAuthorized(req, entry)) return res.status(403).json({ error: 'Cannot modify a published archive' });
      
      await docRef.update({ customName: customName || entry?.customName });
      res.json({ ...entry, customName: customName || entry?.customName });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API endpoint to toggle publish status (one-way finalize)
  app.patch('/api/history/:id/publish', async (req, res) => {
    const { id } = req.params;
    try {
      const docRef = db.collection('archives').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'Not found' });
      }
      
      await docRef.update({ isPublished: true });
      res.json({ ...doc.data(), isPublished: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API endpoint to delete a link from an entry
  app.delete('/api/history/:id/links', async (req, res) => {
    const { id } = req.params;
    const { href } = req.body;
    try {
      const docRef = db.collection('archives').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'Not found' });
      }
      
      const entry = doc.data();
      if (!isAuthorized(req, entry)) return res.status(403).json({ error: 'Cannot modify a published archive' });
      
      const newLinks = entry?.links.filter((l: any) => l.href !== href) || [];
      await docRef.update({ links: newLinks });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // API endpoint to upload a file to an entry (multipart/form-data)
  app.post('/api/history/:id/upload', upload.single('file'), async (req, res) => {
    const { id } = req.params;
    
    try {
      if (!req.file) {
        return res.status(400).json({ error: 'No file uploaded' });
      }

      const docRef = db.collection('archives').doc(id);
      const doc = await docRef.get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'Not found' });
      }
      
      const entry = doc.data();
      if (!isAuthorized(req, entry)) return res.status(403).json({ error: 'Cannot modify a published archive' });
      
      const file = req.file;
      const type = file.originalname.toLowerCase().endsWith('.pdf') ? 'pdf' : 'other';
      const text = file.originalname;

      // Upload to Firebase Storage
      const storageFilePath = `archives/${id}/${Date.now()}_${file.originalname}`;
      const storageFile = bucket.file(storageFilePath);
      
      await storageFile.save(file.buffer, {
        metadata: {
          contentType: file.mimetype,
        },
      });

      // Generate a long-lived signed URL instead of using makePublic
      const [signedUrl] = await storageFile.getSignedUrl({
        action: 'read',
        expires: '01-01-2100' // Far future expiration
      });
      const href = signedUrl;

      const newLinks = [...(entry?.links || []), { text, href, type }];
      await docRef.update({ links: newLinks });
      res.json({ success: true, href });
    } catch (e: any) {
      console.error('File upload error:', e);
      res.status(500).json({ error: e.message || 'File upload failed' });
    }
  });

  // API endpoint to fetch a public shared scrape
  app.get('/api/shared/:id', async (req, res) => {
    const { id } = req.params;
    try {
      const doc = await db.collection('archives').doc(id).get();
      if (!doc.exists) {
        return res.status(404).json({ error: 'Not found or not public' });
      }
      
      const entry = doc.data();
      if (entry && entry.isPublished) {
        res.json(entry);
      } else {
        res.status(404).json({ error: 'Not found or not public' });
      }
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
