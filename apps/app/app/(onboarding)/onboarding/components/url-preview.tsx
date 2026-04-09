'use client';

import { useEffect, useState } from 'react';
import { HiGlobeAlt } from 'react-icons/hi2';

interface UrlPreviewProps {
  url: string;
}

/**
 * Shows a favicon and domain preview when user enters a URL.
 * Uses Google's favicon service for reliable favicon fetching.
 */
export default function UrlPreview({ url }: UrlPreviewProps) {
  const [domain, setDomain] = useState<string | null>(null);
  const [faviconError, setFaviconError] = useState(false);

  useEffect(() => {
    setFaviconError(false);
    if (!url || url.length < 4) {
      setDomain(null);
      return;
    }

    try {
      const normalized = url.includes('://') ? url : `https://${url}`;
      const parsed = new URL(normalized);
      if (parsed.hostname?.includes('.')) {
        setDomain(parsed.hostname);
      } else {
        setDomain(null);
      }
    } catch {
      // Try simple domain extraction
      const cleaned = url.replace(/^https?:\/\//, '').split('/')[0];
      if (cleaned.includes('.') && cleaned.length > 3) {
        setDomain(cleaned);
      } else {
        setDomain(null);
      }
    }
  }, [url]);

  if (!domain) {
    return null;
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  return (
    <div
      className="flex items-center gap-2 mt-2 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded animate-in fade-in slide-in-from-top-1 duration-300"
      role="status"
      aria-label={`Preview for ${domain}`}
    >
      {!faviconError ? (
        <>
          {/* biome-ignore lint/performance/noImgElement: favicon preview is a tiny remote asset and does not benefit from next/image */}
          <img
            src={faviconUrl}
            alt=""
            className="w-4 h-4 rounded-sm"
            onError={() => setFaviconError(true)}
          />
        </>
      ) : (
        <HiGlobeAlt className="w-4 h-4 text-white/40" />
      )}
      <span className="text-xs text-white/50 truncate">{domain}</span>
      <span className="text-[10px] text-white/20 ml-auto">
        We&apos;ll extract colors, logo &amp; voice
      </span>
    </div>
  );
}
