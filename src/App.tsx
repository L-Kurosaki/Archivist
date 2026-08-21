/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { Routes, Route, Link as RouterLink, useParams, useNavigate } from 'react-router-dom';
import { Database, Link as LinkIcon, Search, FileText, ExternalLink, AlertCircle, Loader2, RefreshCw, Share2, Trash2, ShieldAlert, Upload, Lock } from 'lucide-react';
import type { ScrapedEntry } from './types';
import FileTree from './components/FileTree';

function useAdminUnlock() {
  const [isAdmin, setIsAdmin] = useState(false);
  
  useEffect(() => {
    let currentSequence = '';
    const secret = 'mbsczhyzbxX&7';

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore modifier keys
      if (['Shift', 'Control', 'Alt', 'Meta', 'CapsLock', 'Tab'].includes(e.key)) return;
      
      if (e.key === secret[currentSequence.length]) {
        currentSequence += e.key;
        if (currentSequence === secret) {
          setIsAdmin(true);
          currentSequence = '';
        }
      } else if (e.key === secret[0]) {
        currentSequence = e.key;
      } else {
        currentSequence = '';
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return isAdmin;
}

function Dashboard() {
  const [url, setUrl] = useState('');
  const [customName, setCustomName] = useState('');
  const [cookie, setCookie] = useState('');
  const [depth, setDepth] = useState(1);
  const [isScraping, setIsScraping] = useState(false);
  const [history, setHistory] = useState<ScrapedEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  
  const isAdminMode = useAdminUnlock();

  const getHeaders = () => {
    const headers: any = { 'Content-Type': 'application/json' };
    if (isAdminMode) headers['x-admin-secret'] = 'mbsczhyzbxX&7';
    return headers;
  };

  const fetchHistory = async () => {
    try {
      const res = await fetch('/api/history');
      if (res.ok) {
        const data = await res.json();
        setHistory(data);
      }
    } catch (err) {
      console.error('Failed to fetch history:', err);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleScrape = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url) return;
    setIsScraping(true);
    setError(null);
    try {
      const res = await fetch('/api/scrape', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, cookie, depth, customName }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || data.errorMessage || 'Failed to scrape website');
      await fetchHistory();
      setUrl('');
      setCustomName('');
    } catch (err: any) {
      setError(err.message || 'An error occurred during scraping');
    } finally {
      setIsScraping(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this scrape record?')) return;
    try {
      await fetch(`/api/history/${id}`, { method: 'DELETE', headers: getHeaders() });
      await fetchHistory();
    } catch (err) {
      console.error(err);
    }
  };

  const handlePublish = async (id: string) => {
    if (!window.confirm('Are you sure you want to finalize and publish this archive? You will NOT be able to make any further changes.')) return;
    try {
      await fetch(`/api/history/${id}/publish`, { method: 'PATCH', headers: getHeaders() });
      await fetchHistory();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDeleteLink = async (entryId: string, href: string) => {
    if (!window.confirm('Delete this file from the archive?')) return;
    try {
      await fetch(`/api/history/${entryId}/links`, {
        method: 'DELETE',
        headers: getHeaders(),
        body: JSON.stringify({ href }),
      });
      await fetchHistory();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFileUpload = (entryId: string) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.onchange = async (e: any) => {
      const file = e.target.files[0];
      if (!file) return;
      
      // Limit to 50MB for Firebase Storage
      if (file.size > 50 * 1024 * 1024) {
        alert('File is too large (max 50MB).');
        return;
      }

      const formData = new FormData();
      formData.append('file', file);

      try {
        await fetch(`/api/history/${entryId}/upload`, {
          method: 'POST',
          // Do not set Content-Type header manually when using FormData, 
          // the browser will set it to multipart/form-data with the correct boundary
          headers: {
             // Pass the secret header for authorization, but omit Content-Type
            'x-admin-secret': getHeaders()['x-admin-secret'] || ''
          },
          body: formData,
        });
        await fetchHistory();
      } catch (err) {
        console.error(err);
      }
    };
    input.click();
  };

  const handleRename = async (id: string, currentName: string) => {
    const newName = window.prompt('Enter new directory name:', currentName);
    if (newName && newName !== currentName) {
      try {
        await fetch(`/api/history/${id}/name`, {
          method: 'PATCH',
          headers: getHeaders(),
          body: JSON.stringify({ customName: newName }),
        });
        await fetchHistory();
      } catch (err) {
        console.error(err);
      }
    }
  };

  const filteredHistory = useMemo(() => {
    if (!searchQuery.trim()) return history;
    const lowerQuery = searchQuery.toLowerCase();
    return history.filter(entry => 
      entry.url.toLowerCase().includes(lowerQuery) || 
      entry.links.some(l => (l.text && l.text.toLowerCase().includes(lowerQuery)) || l.href.toLowerCase().includes(lowerQuery))
    );
  }, [history, searchQuery]);

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans p-6 md:p-12">
      <div className="max-w-6xl mx-auto space-y-10">
        
        <header className="space-y-2">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full bg-[#c5a059] animate-pulse"></div>
            <h1 className="text-2xl font-serif italic text-white tracking-tight">Archivist.io</h1>
          </div>
          <p className="text-[#888] text-sm max-w-2xl">
            Automated Scraping Engine & Archiver (Admin Dashboard)
          </p>
        </header>

        <div className="bg-[#0f0f0f] border border-[#222] rounded-lg overflow-hidden">
          <div className="p-6 md:p-8">
            <form onSubmit={handleScrape} className="space-y-6">
              <div className="space-y-4">
                <div>
                  <label htmlFor="url" className="block text-[10px] uppercase tracking-[0.2em] text-[#555] mb-2">
                    Target URL
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-[#555]">
                      <Search className="w-5 h-5" />
                    </div>
                    <input
                      type="url"
                      id="url"
                      value={url}
                      onChange={(e) => setUrl(e.target.value)}
                      placeholder="https://example.edu/course/materials"
                      className="block w-full pl-11 pr-4 py-3 bg-[#151515] border border-[#222] rounded focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] transition-colors text-[#e0e0e0] placeholder:text-[#555] font-mono text-sm outline-none"
                      required
                      disabled={isScraping}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="md:col-span-2">
                    <label htmlFor="customName" className="block text-[10px] uppercase tracking-[0.2em] text-[#555] mb-2">
                      Directory Name (Optional)
                    </label>
                    <input
                      type="text"
                      id="customName"
                      value={customName}
                      onChange={(e) => setCustomName(e.target.value)}
                      placeholder="e.g. CS101 Assignments"
                      className="block w-full px-4 py-3 bg-[#151515] border border-[#222] rounded focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] transition-colors text-[#e0e0e0] placeholder:text-[#555] font-mono text-sm outline-none"
                      disabled={isScraping}
                    />
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="cookie" className="block text-[10px] uppercase tracking-[0.2em] text-[#555] mb-2">
                      Cookie or Raw Request Headers (JSON)
                    </label>
                    <textarea
                      id="cookie"
                      value={cookie}
                      onChange={(e) => setCookie(e.target.value)}
                      placeholder='Paste standard cookie string OR Firefox/Chrome raw headers JSON (e.g. {"requestHeaders": {"headers": [...]}})'
                      className="block w-full px-4 py-3 bg-[#151515] border border-[#222] rounded focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] transition-colors text-[#e0e0e0] placeholder:text-[#555] font-mono text-sm outline-none resize-y min-h-[100px]"
                      disabled={isScraping}
                    />
                    <p className="mt-2 text-[10px] text-[#666]">
                      For strict portals, right-click the page request in your browser's Network tab, select "Copy &gt; Copy Request Headers", and paste the JSON here to match your exact User-Agent and Session.
                    </p>
                  </div>

                  <div className="md:col-span-2">
                    <label htmlFor="depth" className="block text-[10px] uppercase tracking-[0.2em] text-[#555] mb-2">
                      Crawl Depth
                    </label>
                    <select
                      id="depth"
                      value={depth}
                      onChange={(e) => setDepth(Number(e.target.value))}
                      className="block w-full px-4 py-3 bg-[#151515] border border-[#222] rounded focus:ring-1 focus:ring-[#c5a059] focus:border-[#c5a059] transition-colors text-[#e0e0e0] font-mono text-sm outline-none"
                      disabled={isScraping}
                    >
                      <option value={1}>1 (Current Page & Iframes)</option>
                      <option value={2}>2 (Follow Internal Links)</option>
                      <option value={3}>3 (Deep Crawl)</option>
                    </select>
                  </div>
                </div>
              </div>

              {error && (
                <div className="bg-[#1a0a0a] text-[#ff5555] p-4 rounded flex items-start gap-3 border border-[#331111]">
                  <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                  <div className="text-sm">{error}</div>
                </div>
              )}

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={isScraping || !url}
                  className="w-full md:w-auto flex items-center justify-center gap-2 bg-[#c5a059] hover:bg-[#d6b06a] text-[#0a0a0a] px-8 py-3 rounded text-[10px] uppercase font-bold tracking-widest transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isScraping ? (
                    <><Loader2 className="w-5 h-5 animate-spin" /> Scraping...</>
                  ) : (
                    <><Search className="w-5 h-5" /> Extract Content</>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>

        <div className="space-y-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <h2 className="text-lg font-serif text-[#f0f0f0] flex items-center gap-2">
              <Database className="w-5 h-5 text-[#c5a059]" />
              Local Database Archive
            </h2>
            
            <div className="flex items-center gap-3">
              <div className="relative">
                <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-[#555]" />
                <input
                  type="text"
                  placeholder="Search files & URLs..."
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="pl-9 pr-4 py-2 bg-[#0f0f0f] border border-[#222] rounded text-sm text-[#e0e0e0] focus:border-[#c5a059] outline-none w-64"
                />
              </div>
              <button 
                onClick={fetchHistory}
                disabled={isScraping}
                className="p-2 text-[#888] hover:text-[#c5a059] hover:bg-[#151515] rounded transition-colors"
                title="Refresh Archive"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
          </div>

          {filteredHistory.length === 0 ? (
            <div className="text-center py-16 bg-[#0f0f0f] border border-[#222] border-dashed rounded-lg text-[#666]">
              <Database className="w-12 h-12 mx-auto mb-3 text-[#333]" />
              <p>No archives found matching your search.</p>
            </div>
          ) : (
            <div className="grid gap-6">
              {filteredHistory.map((entry) => (
                <div key={entry.id} className="bg-[#0f0f0f] border border-[#222] rounded-lg overflow-hidden flex flex-col md:flex-row">
                  {/* Left Metadata Panel */}
                  <div className="md:w-72 border-b md:border-b-0 md:border-r border-[#222] bg-[#111] p-5 flex flex-col gap-4 shrink-0">
                    <div>
                      <div className="flex items-center gap-2 mb-2">
                        <span className={`w-1.5 h-1.5 rounded-full ${entry.status === 'success' ? 'bg-[#c5a059] animate-pulse' : 'bg-[#ff5555]'}`}></span>
                        <span className="text-[9px] font-mono text-[#888] uppercase">
                          {new Date(entry.timestamp).toLocaleString()}
                        </span>
                      </div>
                      <div className="flex items-start justify-between gap-2">
                        <span className="text-[#c5a059] font-mono text-sm break-all font-bold">
                          {entry.customName || 'Unnamed Directory'}
                        </span>
                        {(!entry.isPublished || isAdminMode) && (
                          <button
                            onClick={() => handleRename(entry.id, entry.customName || '')}
                            className="text-[#555] hover:text-[#e0e0e0] text-[9px] uppercase tracking-widest px-2 py-1 border border-[#333] hover:border-[#666] rounded transition-colors"
                          >
                            Rename
                          </button>
                        )}
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2 text-[10px] tracking-widest uppercase text-[#888]">
                      <span className="bg-[#1a1a1a] border border-[#222] px-2 py-1 rounded flex items-center gap-1">
                        <FileText className="w-3 h-3" /> {entry.links.filter(l => l.type === 'pdf').length}
                      </span>
                      <span className="bg-[#1a1a1a] border border-[#222] px-2 py-1 rounded flex items-center gap-1">
                        <LinkIcon className="w-3 h-3" /> {entry.links.length}
                      </span>
                    </div>

                    <div className="mt-auto pt-4 space-y-2">
                      {!entry.isPublished || isAdminMode ? (
                        <>
                          <button 
                            onClick={() => handleFileUpload(entry.id)}
                            className="w-full py-2 border border-[#444] text-[#aaa] hover:bg-[#1a1a1a] text-[10px] uppercase font-bold rounded tracking-tighter transition-colors"
                          >
                            <Upload className="w-3 h-3 inline mr-1" /> Upload File
                          </button>

                          {!entry.isPublished && (
                            <button 
                              onClick={() => handlePublish(entry.id)}
                              className="w-full py-2 text-[10px] uppercase font-bold rounded tracking-tighter transition-colors border border-[#c5a059] text-[#c5a059] hover:bg-[#c5a059] hover:text-black"
                            >
                              Publish (Finalize)
                            </button>
                          )}
                          
                          <button 
                            onClick={() => handleDelete(entry.id)}
                            className="w-full py-2 border border-[#440000] text-[#ff5555] hover:bg-[#1a0505] text-[10px] uppercase font-bold rounded tracking-tighter transition-colors"
                          >
                            <Trash2 className="w-3 h-3 inline mr-1" /> Delete Archive
                          </button>
                        </>
                      ) : null}

                      {entry.isPublished && (
                        <>
                          <div className="w-full py-2 flex items-center justify-center gap-1 text-[#c5a059] text-[10px] uppercase font-bold tracking-tighter">
                            <Lock className="w-3 h-3" /> Locked (Published) {isAdminMode && '- ADMIN OVERRIDE'}
                          </div>
                          
                          <a 
                            href={`/shared/${entry.id}`} 
                            target="_blank"
                            rel="noreferrer"
                            className="w-full py-2 flex items-center justify-center gap-1.5 bg-[#c5a059] text-black text-[10px] uppercase font-bold rounded tracking-tighter transition-colors hover:bg-[#d6b06a]"
                          >
                            <Share2 className="w-3 h-3" /> View Public Link
                          </a>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Right Content Panel - Tree View */}
                  <div className="flex-1 p-5 overflow-hidden flex flex-col">
                    <h3 className="text-[10px] uppercase tracking-widest text-[#666] mb-4">Extracted Hierarchy</h3>
                    {entry.status === 'error' ? (
                      <div className="p-6 text-[#ff5555] font-mono text-xs flex items-center gap-2 border border-[#331111] bg-[#1a0a0a] rounded">
                        <AlertCircle className="w-4 h-4 shrink-0" />
                        {entry.errorMessage}
                      </div>
                    ) : (
                      <div className="flex-1 overflow-y-auto max-h-[400px] pr-2">
                         <FileTree 
                           links={entry.links} 
                           isEditable={!entry.isPublished || isAdminMode} 
                           onDelete={(href) => handleDeleteLink(entry.id, href)} 
                         />
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function PublicView() {
  const { id } = useParams();
  const [entry, setEntry] = useState<ScrapedEntry | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const isAdminMode = useAdminUnlock();

  const fetchShared = async () => {
    try {
      const res = await fetch(`/api/shared/${id}`);
      if (!res.ok) throw new Error('This archive is not public or does not exist.');
      const data = await res.json();
      setEntry(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShared();
  }, [id]);

  const handleDeleteLink = async (href: string) => {
    if (!window.confirm('Delete this file from the archive?')) return;
    try {
      await fetch(`/api/history/${id}/links`, {
        method: 'DELETE',
        headers: { 
          'Content-Type': 'application/json',
          ...(isAdminMode ? { 'x-admin-secret': 'mbsczhyzbxX&7' } : {})
        },
        body: JSON.stringify({ href }),
      });
      await fetchShared();
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-[#c5a059] animate-spin" />
      </div>
    );
  }

  if (error || !entry) {
    return (
      <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] p-8 flex flex-col items-center justify-center">
        <ShieldAlert className="w-12 h-12 text-[#ff5555] mb-4" />
        <h2 className="text-xl font-serif text-[#f0f0f0] mb-2">Access Denied</h2>
        <p className="text-[#888] font-mono text-sm">{error}</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0a0a0a] text-[#e0e0e0] font-sans p-6 md:p-12">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="border-b border-[#222] pb-6 flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-3 h-3 rounded-full bg-[#c5a059]"></div>
              <h1 className="text-2xl font-serif italic text-white tracking-tight">Archivist.io</h1>
            </div>
            <p className="text-[#888] text-xs uppercase tracking-widest mt-2">Publicly Shared Archive</p>
          </div>
          
          <div className="text-right">
             <p className="text-[#c5a059] font-mono text-sm break-all font-bold mb-1">
               {entry.customName || 'Unnamed Directory'}
             </p>
             <p className="text-[#444] font-mono text-[9px] mt-2">Scraped: {new Date(entry.timestamp).toLocaleString()}</p>
          </div>
        </header>

        <section>
          <div className="bg-[#0f0f0f] border border-[#222] rounded-lg p-6">
             <h3 className="text-[10px] uppercase tracking-widest text-[#666] mb-6 flex items-center justify-between">
               <span>Extracted Files & Links</span>
               <span className="bg-[#1a1a1a] px-2 py-1 rounded text-[#888] border border-[#222]">
                 {entry.links.length} total objects
               </span>
             </h3>
             <FileTree 
               links={entry.links} 
               isEditable={isAdminMode}
               onDelete={handleDeleteLink}
             />
          </div>
        </section>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Dashboard />} />
      <Route path="/shared/:id" element={<PublicView />} />
    </Routes>
  );
}
