'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { HiGlobeAlt } from 'react-icons/hi2';

interface UrlPreviewProps {
  url: string;
}

function parseDomain(url: string): string | null {
  if (!url || url.length < 4) {
    return null;
  }
  try {
    const normalized = url.includes('://') ? url : `https://${url}`;
    const parsed = new URL(normalized);
    return parsed.hostname?.includes('.') ? parsed.hostname : null;
  } catch {
    // Try simple domain extraction
    const cleaned = url.replace(/^https?:\/\//, '').split('/')[0];
    return cleaned.includes('.') && cleaned.length > 3 ? cleaned : null;
  }
}

/**
 * Shows a favicon and domain preview when user enters a URL.
 * Uses Google's favicon service for reliable favicon fetching.
 */
export default function UrlPreview({ url }: UrlPreviewProps) {
  const [faviconError, setFaviconError] = useState(false);
  const prevUrlRef = useRef(url);
  if (url !== prevUrlRef.current) {
    prevUrlRef.current = url;
    setFaviconError(false);
  }

  const domain = parseDomain(url);

  if (!domain) {
    return null;
  }

  const faviconUrl = `https://www.google.com/s2/favicons?domain=${domain}&sz=32`;

  return (
    <output
      className="flex items-center gap-2 mt-2 px-3 py-2 bg-white/[0.03] border border-white/[0.06] rounded animate-in fade-in slide-in-from-top-1 duration-300"
      aria-label={`Preview for ${domain}`}
    >
      {!faviconError ? (
        <Image
          unoptimized
          src={faviconUrl}
          alt=""
          className="size-4 rounded-sm"
          onError={() => setFaviconError(true)}
          width={800}
          height={600}
        />
      ) : (
        <HiGlobeAlt className="size-4 text-white/40" />
      )}
      <span className="text-xs text-white/50 truncate">{domain}</span>
      <span className="text-[10px] text-white/20 ml-auto">
        We&apos;ll extract colors, logo &amp; voice
      </span>
    </output>
  );
}
