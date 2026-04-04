import type { ReactElement } from 'react';
import { useState } from 'react';
import { LoadingSpinner } from '~components/ui';
import type { DetectedContent } from '~services/content-detector.service';
import { logger } from '~utils/logger.util';

type SocialPlatform = 'twitter' | 'linkedin' | 'instagram' | 'tiktok';

interface PlatformConfig {
  label: string;
  iconPath: string;
  iconColor?: string;
  getAuthor: (content: DetectedContent) => string | undefined;
  getAuthorDisplay: (content: DetectedContent) => string;
  getContentText: (content: DetectedContent) => string;
  getContentType: () => string;
  getPlatformData: (content: DetectedContent) => Record<string, unknown>;
  buttonText: string;
  successMessage: string;
}

const PLATFORM_CONFIGS: Record<SocialPlatform, PlatformConfig> = {
  instagram: {
    buttonText: 'Bookmark Post',
    getAuthor: (c) => c.username,
    getAuthorDisplay: (c) => (c.username ? `@${c.username}` : ''),
    getContentText: (c) => c.caption || 'Instagram post',
    getContentType: () => 'post',
    getPlatformData: (c) => ({ postId: c.instagramId }),
    iconColor: 'text-pink-600',
    iconPath:
      'M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z',
    label: 'Instagram Post',
    successMessage: 'Instagram post bookmarked successfully!',
  },
  linkedin: {
    buttonText: 'Bookmark Post',
    getAuthor: (c) => c.postAuthor,
    getAuthorDisplay: (c) => c.postAuthor || '',
    getContentText: (c) => c.postText || 'LinkedIn post',
    getContentType: () => 'post',
    getPlatformData: (c) => ({ postId: c.postId }),
    iconColor: 'text-blue-700',
    iconPath:
      'M20.447 20.452h-3.554v-5.569c0-1.328-.027-3.037-1.852-3.037-1.853 0-2.136 1.445-2.136 2.939v5.667H9.351V9h3.414v1.561h.046c.477-.9 1.637-1.85 3.37-1.85 3.601 0 4.267 2.37 4.267 5.455v6.286zM5.337 7.433c-1.144 0-2.063-.926-2.063-2.065 0-1.138.92-2.063 2.063-2.063 1.14 0 2.064.925 2.064 2.063 0 1.139-.925 2.065-2.064 2.065zm1.782 13.019H3.555V9h3.564v11.452zM22.225 0H1.771C.792 0 0 .774 0 1.729v20.542C0 23.227.792 24 1.771 24h20.451C23.2 24 24 23.227 24 22.271V1.729C24 .774 23.2 0 22.222 0h.003z',
    label: 'LinkedIn Post',
    successMessage: 'LinkedIn post bookmarked successfully!',
  },
  tiktok: {
    buttonText: 'Bookmark Video',
    getAuthor: (c) => c.creator,
    getAuthorDisplay: (c) => c.creator || '',
    getContentText: (c) => c.description || 'TikTok video',
    getContentType: () => 'video',
    getPlatformData: (c) => ({ videoId: c.tikTokId }),
    iconPath:
      'M12.53.02C13.84 0 15.14.01 16.44 0c.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z',
    label: 'TikTok Video',
    successMessage: 'TikTok video bookmarked successfully!',
  },
  twitter: {
    buttonText: 'Bookmark Tweet',
    getAuthor: (c) => c.tweetAuthor,
    getAuthorDisplay: (c) => `@${c.tweetAuthorHandle || 'unknown'}`,
    getContentText: (c) => c.tweetText || 'No content available',
    getContentType: () => 'tweet',
    getPlatformData: (c) => ({ tweetId: c.tweetId }),
    iconPath:
      'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
    label: 'Twitter/X Post',
    successMessage: 'Tweet bookmarked successfully!',
  },
};

interface BookmarkQuickActionProps {
  content: DetectedContent;
  platform: SocialPlatform;
}

export function BookmarkQuickAction({
  content,
  platform,
}: BookmarkQuickActionProps): ReactElement {
  const [isSaving, setIsSaving] = useState(false);
  const config = PLATFORM_CONFIGS[platform];

  async function handleBookmark(): Promise<void> {
    setIsSaving(true);

    try {
      const response = await chrome.runtime.sendMessage({
        data: {
          author: config.getAuthor(content),
          authorHandle: config.getAuthorDisplay(content).replace('@', ''),
          content: config.getContentText(content),
          intent: 'inspiration',
          platform,
          platformData: config.getPlatformData(content),
          type: config.getContentType(),
          url: content.url,
        },
        event: 'saveBookmark',
      });

      if (response?.success) {
        alert(`✅ ${config.successMessage}`);
      } else {
        alert(`❌ Failed: ${response?.error || 'Unknown error'}`);
      }
    } catch (error) {
      logger.error(`Error bookmarking ${platform} content`, error);
      alert(`❌ Failed to bookmark ${config.getContentType()}`);
    } finally {
      setIsSaving(false);
    }
  }

  const authorDisplay = config.getAuthorDisplay(content);

  return (
    <div className=" border border-white/[0.08] bg-muted text-card-foreground shadow-sm mb-4">
      <div className="p-4">
        <div className="flex items-center gap-2 mb-2">
          <svg
            aria-hidden="true"
            className={`w-5 h-5 ${config.iconColor || ''}`}
            fill="currentColor"
            viewBox="0 0 24 24"
          >
            <path d={config.iconPath} />
          </svg>
          <span className="text-xs font-semibold text-muted-foreground">
            {config.label}
          </span>
        </div>

        <div className="mb-3">
          {authorDisplay && (
            <p className="text-sm font-semibold">{authorDisplay}</p>
          )}
          <p className="text-sm mt-2 line-clamp-4 text-muted-foreground">
            {config.getContentText(content)}
          </p>
        </div>

        <button
          type="button"
          onClick={handleBookmark}
          className="inline-flex items-center justify-center gap-2 h-8 px-3 w-full text-xs font-medium bg-primary text-primary-foreground shadow hover:bg-primary/90 transition-colors disabled:pointer-events-none disabled:opacity-50"
          disabled={isSaving}
        >
          {isSaving ? (
            <>
              <LoadingSpinner size="sm" />
              Saving...
            </>
          ) : (
            config.buttonText
          )}
        </button>
      </div>
    </div>
  );
}

// Platform-specific convenience wrappers.
export function TwitterQuickAction({
  content,
}: {
  content: DetectedContent;
}): ReactElement {
  return <BookmarkQuickAction content={content} platform="twitter" />;
}

export function LinkedInQuickAction({
  content,
}: {
  content: DetectedContent;
}): ReactElement {
  return <BookmarkQuickAction content={content} platform="linkedin" />;
}

export function InstagramQuickAction({
  content,
}: {
  content: DetectedContent;
}): ReactElement {
  return <BookmarkQuickAction content={content} platform="instagram" />;
}

export function TikTokQuickAction({
  content,
}: {
  content: DetectedContent;
}): ReactElement {
  return <BookmarkQuickAction content={content} platform="tiktok" />;
}
