import type { ReactElement } from 'react';
import { useState } from 'react';
import { LoadingSpinner } from '~components/ui';
import { logger } from '~utils/logger.util';

type SupportedPlatform =
  | 'youtube'
  | 'twitter'
  | 'linkedin'
  | 'instagram'
  | 'tiktok';

const PLATFORM_PATTERNS: Array<{
  platform: SupportedPlatform;
  patterns: string[];
}> = [
  { patterns: ['youtube.com', 'youtu.be'], platform: 'youtube' },
  { patterns: ['twitter.com', 'x.com'], platform: 'twitter' },
  { patterns: ['linkedin.com'], platform: 'linkedin' },
  { patterns: ['instagram.com'], platform: 'instagram' },
  { patterns: ['tiktok.com'], platform: 'tiktok' },
];

function detectPlatform(url: string): SupportedPlatform | null {
  for (const { platform, patterns } of PLATFORM_PATTERNS) {
    if (patterns.some((pattern) => url.includes(pattern))) {
      return platform;
    }
  }
  return null;
}

export function ManualUrlInput(): ReactElement {
  const [url, setUrl] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  async function handleProcess(): Promise<void> {
    if (!url) {
      return;
    }

    setIsProcessing(true);

    try {
      const platform = detectPlatform(url);

      if (!platform) {
        alert(
          'Unsupported platform. Please use YouTube, Twitter, LinkedIn, Instagram, or TikTok URLs.',
        );
        return;
      }

      if (platform === 'youtube') {
        const response = await chrome.runtime.sendMessage({
          payload: { youtubeUrl: url },
          type: 'PROCESS_YOUTUBE_TRANSCRIPT',
        });

        if (response.success) {
          alert('Transcript processing started!');
          setUrl('');
        } else {
          alert(`Failed: ${response.error || 'Unknown error'}`);
        }
        return;
      }

      // For social platforms, save as bookmark
      const response = await chrome.runtime.sendMessage({
        data: {
          intent: 'inspiration',
          platform,
          type: 'post',
          url,
        },
        event: 'saveBookmark',
      });

      if (response?.success) {
        alert('Bookmarked successfully!');
        setUrl('');
      } else {
        alert(`Failed: ${response?.error || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error('Error processing URL', error);
      alert('Failed to process URL');
    } finally {
      setIsProcessing(false);
    }
  }

  return (
    <details className="group border border-white/[0.08] bg-muted">
      <summary className="flex cursor-pointer items-center justify-between px-4 py-3 text-sm font-medium list-none">
        Manual URL Input
        <svg
          aria-hidden="true"
          className="h-4 w-4 shrink-0 transition-transform duration-200 group-open:rotate-180"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </summary>
      <div className="px-4 pb-4">
        <input
          type="url"
          value={url}
          onChange={(e) => setUrl(e.target.value)}
          placeholder="Paste YouTube, Twitter, LinkedIn, Instagram, or TikTok URL..."
          className="flex h-8 w-full border border-input bg-transparent px-3 py-1 text-xs shadow-sm transition-colors placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50 mb-2"
        />
        <button
          type="button"
          onClick={handleProcess}
          className="inline-flex items-center justify-center gap-2 h-8 px-3 w-full text-xs font-medium border border-input bg-background shadow-sm hover:bg-accent hover:text-accent-foreground transition-colors disabled:pointer-events-none disabled:opacity-50"
          disabled={!url || isProcessing}
        >
          {isProcessing ? (
            <>
              <LoadingSpinner size="sm" />
              Processing...
            </>
          ) : (
            'Process URL'
          )}
        </button>
      </div>
    </details>
  );
}
