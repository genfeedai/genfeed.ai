import { SocialUrlHelper } from '@genfeedai/helpers';
import { logger } from '~utils/logger.util';

export interface DetectedContent {
  platform: 'youtube' | 'twitter' | 'linkedin' | 'instagram' | 'tiktok' | null;
  type: 'video' | 'tweet' | 'post' | null;
  url: string;
  timestamp: string;

  videoId?: string;
  videoTitle?: string;
  videoThumbnail?: string;
  channelName?: string;

  tweetId?: string;
  tweetText?: string;
  tweetAuthor?: string;
  tweetAuthorHandle?: string;

  postId?: string;
  postText?: string;
  postAuthor?: string;

  instagramId?: string;
  caption?: string;
  username?: string;

  tikTokId?: string;
  description?: string;
  creator?: string;
}

type PlatformKey = 'youtube' | 'twitter' | 'linkedin' | 'instagram' | 'tiktok';

interface PlatformMatcher {
  patterns: string[];
  detector: (tab: chrome.tabs.Tab) => Promise<DetectedContent | null>;
}

export class ContentDetectorService {
  private readonly platformMatchers: Record<PlatformKey, PlatformMatcher> = {
    instagram: {
      detector: (tab) => this.detectInstagram(tab),
      patterns: ['instagram.com'],
    },
    linkedin: {
      detector: (tab) => this.detectLinkedIn(tab),
      patterns: ['linkedin.com'],
    },
    tiktok: {
      detector: (tab) => this.detectTikTok(tab),
      patterns: ['tiktok.com'],
    },
    twitter: {
      detector: (tab) => this.detectTwitter(tab),
      patterns: ['twitter.com', 'x.com'],
    },
    youtube: {
      detector: (tab) => this.detectYouTube(tab),
      patterns: ['youtube.com', 'youtu.be'],
    },
  };

  async detectCurrentTab(): Promise<DetectedContent | null> {
    try {
      const [tab] = await chrome.tabs.query({
        active: true,
        currentWindow: true,
      });
      if (!tab.url || !tab.id) {
        return null;
      }

      for (const { patterns, detector } of Object.values(
        this.platformMatchers,
      )) {
        if (patterns.some((pattern) => tab.url?.includes(pattern))) {
          return detector(tab);
        }
      }

      return null;
    } catch (error) {
      logger.error('Error detecting content', error);
      return null;
    }
  }

  private async detectYouTube(
    tab: chrome.tabs.Tab,
  ): Promise<DetectedContent | null> {
    if (!tab.id || !tab.url) {
      return null;
    }

    try {
      const [result] = await chrome.scripting.executeScript({
        func: () => {
          const videoId = new URLSearchParams(window.location.search).get('v');
          const titleEl = document.querySelector(
            'h1.ytd-watch-metadata yt-formatted-string, h1 yt-formatted-string',
          );
          const title = titleEl?.textContent?.trim();
          const thumbnail = document
            .querySelector('meta[property="og:image"]')
            ?.getAttribute('content');
          const channelEl = document.querySelector(
            'ytd-channel-name#channel-name a, #channel-name a',
          );
          const channel = channelEl?.textContent?.trim();

          return { channel, thumbnail, title, videoId };
        },
        target: { tabId: tab.id },
      });

      if (!result?.result?.videoId) {
        return null;
      }

      return {
        channelName: result.result.channel,
        platform: 'youtube',
        timestamp: new Date().toISOString(),
        type: 'video',
        url: tab.url,
        videoId: result.result.videoId,
        videoThumbnail:
          result.result.thumbnail ||
          `https://img.youtube.com/vi/${result.result.videoId}/maxresdefault.jpg`,
        videoTitle: result.result.title || 'YouTube Video',
      };
    } catch (error) {
      logger.error('Error detecting YouTube content', error);
      return null;
    }
  }

  private async detectTwitter(
    tab: chrome.tabs.Tab,
  ): Promise<DetectedContent | null> {
    if (!tab.id || !tab.url) {
      return null;
    }

    try {
      const [result] = await chrome.scripting.executeScript({
        func: () => {
          const match = window.location.pathname.match(/\/status\/(\d+)/);
          const tweetId = match?.[1];
          if (!tweetId) {
            return null;
          }

          const article = document.querySelector(
            'article[data-testid="tweet"]',
          );
          if (!article) {
            return null;
          }

          const tweetTextEl = article.querySelector(
            '[data-testid="tweetText"]',
          );
          const tweetText = tweetTextEl?.textContent?.trim();

          const authorEl = article.querySelector('[data-testid="User-Name"]');
          const authorName = authorEl
            ?.querySelector('span')
            ?.textContent?.trim();

          const handleEl = article.querySelector(
            '[data-testid="User-Name"] a[href^="/"]',
          );
          const authorHandle = handleEl?.getAttribute('href')?.replace('/', '');

          return { authorHandle, authorName, tweetId, tweetText };
        },
        target: { tabId: tab.id },
      });

      if (!result?.result?.tweetId) {
        return null;
      }

      const canonicalUrl = result.result.authorHandle
        ? SocialUrlHelper.buildTwitterUrl(
            result.result.tweetId,
            result.result.authorHandle,
          )
        : tab.url;

      return {
        platform: 'twitter',
        timestamp: new Date().toISOString(),
        tweetAuthor: result.result.authorName,
        tweetAuthorHandle: result.result.authorHandle,
        tweetId: result.result.tweetId,
        tweetText: result.result.tweetText || '',
        type: 'tweet',
        url: canonicalUrl,
      };
    } catch (error) {
      logger.error('Error detecting Twitter content', error);
      return null;
    }
  }

  private async detectLinkedIn(
    tab: chrome.tabs.Tab,
  ): Promise<DetectedContent | null> {
    if (!tab.id || !tab.url) {
      return null;
    }

    try {
      const [result] = await chrome.scripting.executeScript({
        func: () => {
          const urlMatch = window.location.pathname.match(
            /\/feed\/update\/([^/]+)/,
          );
          const postId = urlMatch?.[1];

          const post = document.querySelector('[data-urn*="activity"]');
          const postText = post
            ?.querySelector('.feed-shared-update-v2__description')
            ?.textContent?.trim();
          const authorEl = post?.querySelector('.feed-shared-actor__name');
          const author = authorEl?.textContent?.trim();

          return { author, postId, postText };
        },
        target: { tabId: tab.id },
      });

      if (!result?.result?.postId) {
        return null;
      }

      return {
        platform: 'linkedin',
        postAuthor: result.result.author,
        postId: result.result.postId,
        postText: result.result.postText,
        timestamp: new Date().toISOString(),
        type: 'post',
        url: tab.url,
      };
    } catch (error) {
      logger.error('Error detecting LinkedIn content', error);
      return null;
    }
  }

  private async detectInstagram(
    tab: chrome.tabs.Tab,
  ): Promise<DetectedContent | null> {
    if (!tab.id || !tab.url) {
      return null;
    }

    try {
      const [result] = await chrome.scripting.executeScript({
        func: () => {
          const postMatch = window.location.pathname.match(/\/p\/([^/]+)/);
          const reelMatch = window.location.pathname.match(/\/reel\/([^/]+)/);
          const instagramId = postMatch?.[1] || reelMatch?.[1];

          const caption = document
            .querySelector('meta[property="og:description"]')
            ?.getAttribute('content');
          const username = document
            .querySelector('meta[property="og:title"]')
            ?.getAttribute('content');

          return { caption, instagramId, username };
        },
        target: { tabId: tab.id },
      });

      if (!result?.result?.instagramId) {
        return null;
      }

      return {
        caption: result.result.caption,
        instagramId: result.result.instagramId,
        platform: 'instagram',
        timestamp: new Date().toISOString(),
        type: 'post',
        url: tab.url,
        username: result.result.username,
      };
    } catch (error) {
      logger.error('Error detecting Instagram content', error);
      return null;
    }
  }

  private async detectTikTok(
    tab: chrome.tabs.Tab,
  ): Promise<DetectedContent | null> {
    if (!tab.id || !tab.url) {
      return null;
    }

    try {
      const [result] = await chrome.scripting.executeScript({
        func: () => {
          const match = window.location.pathname.match(/\/video\/(\d+)/);
          const tikTokId = match?.[1];

          const description = document
            .querySelector('meta[property="og:description"]')
            ?.getAttribute('content');
          const creator = document
            .querySelector('meta[property="og:title"]')
            ?.getAttribute('content');

          return { creator, description, tikTokId };
        },
        target: { tabId: tab.id },
      });

      if (!result?.result?.tikTokId) {
        return null;
      }

      return {
        creator: result.result.creator,
        description: result.result.description,
        platform: 'tiktok',
        tikTokId: result.result.tikTokId,
        timestamp: new Date().toISOString(),
        type: 'video',
        url: tab.url,
      };
    } catch (error) {
      logger.error('Error detecting TikTok content', error);
      return null;
    }
  }
}
