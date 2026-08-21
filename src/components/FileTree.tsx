import { useState, useMemo } from 'react';
import { FileText, Link, Folder, ChevronDown, ChevronRight, Trash2 } from 'lucide-react';
import type { ScrapedLink } from '../types';

interface TreeNode {
  name: string;
  type: 'folder' | 'pdf' | 'link' | 'image' | 'other';
  href?: string;
  originalHref?: string;
  isCloudHosted?: boolean;
  downloadFailed?: boolean;
  downloadError?: string;
  children: Record<string, TreeNode>;
}

export default function FileTree({ links, isEditable, onDelete }: { links: ScrapedLink[], isEditable?: boolean, onDelete?: (href: string) => void }) {
  const tree = useMemo(() => {
    const root: TreeNode = { name: 'root', type: 'folder', children: {} };

    links.forEach(link => {
      try {
        if (link.href.startsWith('data:')) {
          const fileName = link.text || 'uploaded_file';
          if (!root.children['Uploaded_Files']) {
             root.children['Uploaded_Files'] = { name: 'Uploaded_Files', type: 'folder', children: {} };
          }
          root.children['Uploaded_Files'].children[fileName + Math.random().toString(36).substring(7)] = {
            name: fileName,
            type: link.type,
            href: link.href,
            children: {}
          };
          return;
        }

        const url = new URL(link.href);
        const parts = url.pathname.split('/').filter(Boolean);
        
        // If it's just the domain with no path, put it in root
        if (parts.length === 0) {
           root.children[link.text || 'index'] = { name: link.text || link.href, type: link.type, href: link.href, children: {} };
           return;
        }

        let current = root;
        // Build folders
        for (let i = 0; i < parts.length - 1; i++) {
          if (!current.children[parts[i]]) {
            current.children[parts[i]] = { name: parts[i], type: 'folder', children: {} };
          }
          current = current.children[parts[i]];
        }
        
        // Add file
        const fileName = parts[parts.length - 1];
        // Use the link text if it's meaningful, otherwise use the filename
        const displayName = (link.text && link.text.length < 40 && link.text !== 'No text content') 
           ? link.text 
           : fileName;
           
        current.children[fileName + Math.random().toString(36).substring(7)] = { 
          name: displayName, 
          type: link.type, 
          href: link.href, 
          originalHref: link.originalHref,
          isCloudHosted: link.isCloudHosted,
          downloadFailed: link.downloadFailed,
          downloadError: link.downloadError,
          children: {} 
        };

      } catch (e) {
        // Fallback for invalid URLs
        root.children[Math.random().toString()] = { 
          name: link.text || link.href, 
          type: link.type, 
          href: link.href, 
          originalHref: link.originalHref,
          isCloudHosted: link.isCloudHosted,
          downloadFailed: link.downloadFailed,
          downloadError: link.downloadError,
          children: {} 
        };
      }
    });
    return root;
  }, [links]);

  const renderNode = (node: TreeNode, depth: number = 0) => {
    return (
      <div key={node.name + depth + Math.random()} className="font-mono text-xs text-[#aaa]">
        {Object.entries(node.children).map(([key, child], idx, arr) => {
          const isLast = idx === arr.length - 1;
          const prefix = isLast ? '└─' : '├─';
          
          return (
            <div key={key}>
              <div className="flex items-start gap-2 mb-2 hover:bg-[#151515] p-1 -ml-1 rounded transition-colors" style={{ marginLeft: `${depth * 16}px` }}>
                <span className="text-[#444] shrink-0">{prefix}</span>
                {child.type === 'folder' ? (
                  <span className="text-[#c5a059] flex items-center gap-1.5 break-all">
                    <Folder className="w-3.5 h-3.5 shrink-0" />
                    {child.name}
                  </span>
                ) : (
                    <div className="flex flex-col w-full">
                      <div className="flex items-center justify-between w-full group">
                        <a href={child.href} target="_blank" rel="noreferrer" className="flex items-start gap-1.5 hover:text-[#c5a059] transition-colors break-all">
                          {child.type === 'pdf' ? (
                             <FileText className="w-3.5 h-3.5 text-[#ff5555] shrink-0 mt-0.5" />
                          ) : (
                             <Link className="w-3.5 h-3.5 text-[#555] shrink-0 mt-0.5" />
                          )}
                          <span className={child.type === 'pdf' ? 'text-[#e0e0e0]' : 'text-[#888]'}>{child.name}</span>
                          
                          {child.isCloudHosted && (
                            <span className="ml-2 text-[9px] bg-[#1a2a1a] text-[#55ff55] border border-[#2a4a2a] px-1.5 py-0.5 rounded uppercase tracking-wider font-bold whitespace-nowrap mt-0.5">
                              Cloud
                            </span>
                          )}
                        </a>
                        {isEditable && onDelete && child.href && (
                          <button 
                            onClick={() => onDelete(child.href!)} 
                            className="opacity-0 group-hover:opacity-100 text-[#ff5555] hover:text-[#ff2222] p-1 ml-2 transition-opacity shrink-0"
                            title="Delete file"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                      
                      {child.downloadFailed && (
                        <div className="ml-5 mt-1 text-[9px] text-[#ff5555] border-l border-[#ff5555]/30 pl-2">
                          <p className="font-bold uppercase mb-0.5">Auto-download failed (Requires portal login to view)</p>
                          <p className="opacity-70 break-all">{child.downloadError}</p>
                        </div>
                      )}
                    </div>
                )}
              </div>
              {child.type === 'folder' && renderNode(child, depth + 1)}
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div className="p-4 bg-[#0f0f0f] rounded border border-[#222] overflow-x-auto">
      <div className="pl-1">
        {Object.keys(tree.children).length === 0 ? (
          <div className="text-[#555] italic">No hierarchy available</div>
        ) : (
          renderNode(tree)
        )}
      </div>
    </div>
  );
}
