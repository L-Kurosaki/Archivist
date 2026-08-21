export interface ScrapedLink {
  text: string;
  href: string;
  type: 'pdf' | 'link' | 'image' | 'other';
  originalHref?: string;
  isCloudHosted?: boolean;
  downloadFailed?: boolean;
  downloadError?: string;
}

export interface ScrapedEntry {
  id: string;
  url: string;
  timestamp: string;
  links: ScrapedLink[];
  status: 'success' | 'error';
  errorMessage?: string;
  isPublished?: boolean;
  customName?: string;
}
