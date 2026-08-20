import express from 'express';
import axios from 'axios';
import * as cheerio from 'cheerio';
import path from 'path';
import { createServer as createViteServer } from 'vite';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));

  // In-memory array to simulate a structured database
  const database: any[] = [];

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

      const entry = {
        id: Date.now().toString(),
        url,
        customName: customName || url,
        timestamp: new Date().toISOString(),
        links,
        status: 'success',
        isPublished: false
      };

      database.push(entry);
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
      database.push(errorEntry);
      res.status(500).json(errorEntry);
    }
  });

  // API endpoint to fetch history from the "database"
  app.get('/api/history', (req, res) => {
    res.json(database.sort((a, b) => parseInt(b.id) - parseInt(a.id)));
  });

  // Helper to check authorization (admin override via secret header)
  const isAuthorized = (req: express.Request, entry: any) => {
    const isAdmin = req.headers['x-admin-secret'] === 'mbsczhyzbxX&7';
    return !entry.isPublished || isAdmin;
  };

  // API endpoint to delete an entry
  app.delete('/api/history/:id', (req, res) => {
    const { id } = req.params;
    const index = database.findIndex(entry => entry.id === id);
    if (index !== -1) {
      if (!isAuthorized(req, database[index])) {
         return res.status(403).json({ error: 'Cannot modify a published archive' });
      }
      database.splice(index, 1);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // API endpoint to rename an entry
  app.patch('/api/history/:id/name', (req, res) => {
    const { id } = req.params;
    const { customName } = req.body;
    const entry = database.find(entry => entry.id === id);
    if (entry) {
      if (!isAuthorized(req, entry)) return res.status(403).json({ error: 'Cannot modify a published archive' });
      entry.customName = customName || entry.customName;
      res.json(entry);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // API endpoint to toggle publish status (one-way finalize)
  app.patch('/api/history/:id/publish', (req, res) => {
    const { id } = req.params;
    const entry = database.find(entry => entry.id === id);
    if (entry) {
      entry.isPublished = true;
      res.json(entry);
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // API endpoint to delete a link from an entry
  app.delete('/api/history/:id/links', (req, res) => {
    const { id } = req.params;
    const { href } = req.body;
    const entry = database.find(entry => entry.id === id);
    if (entry) {
      if (!isAuthorized(req, entry)) return res.status(403).json({ error: 'Cannot modify a published archive' });
      entry.links = entry.links.filter((l: any) => l.href !== href);
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // API endpoint to upload a file to an entry
  app.post('/api/history/:id/upload', (req, res) => {
    const { id } = req.params;
    const { text, href, type } = req.body;
    const entry = database.find(entry => entry.id === id);
    if (entry) {
      if (!isAuthorized(req, entry)) return res.status(403).json({ error: 'Cannot modify a published archive' });
      entry.links.push({ text, href, type });
      res.json({ success: true });
    } else {
      res.status(404).json({ error: 'Not found' });
    }
  });

  // API endpoint to fetch a public shared scrape
  app.get('/api/shared/:id', (req, res) => {
    const { id } = req.params;
    const entry = database.find(entry => entry.id === id);
    if (entry && entry.isPublished) {
      res.json(entry);
    } else {
      res.status(404).json({ error: 'Not found or not public' });
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
