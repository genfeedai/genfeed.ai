import { Platform } from '@genfeedai/enums';
import { SocialUrlHelper } from '@genfeedai/helpers';

// Platform configuration for multi-platform support
export interface PlatformConfig {
  name: string;
  platform: Platform; // Added enum reference
  hostnames: string[];
  // Optional URL patterns for pathname-based detection (useful for SPAs)
  urlPatterns?: RegExp[];
  selectors: {
    // Selector for the post/tweet/comment container
    postContainer: string;
    // Selector for the action buttons container (like, share, etc.)
    actionsContainer: string;
    // Selector for the reply/comment textarea
    replyTextarea: string;
    // Selector for the post/submit button
    submitButton?: string;
    // Selector to identify individual posts
    postIdentifier: string;
  };
  // Function to extract post ID from URL or element
  extractPostId: (element?: Element) => string | null;
  // Function to construct post URL from post ID
  constructPostUrl: (postId: string) => string;
  // Platform-specific button injection logic
  injectButtons?: (postId: string, container: Element) => void;
}

export const platforms: Record<string, PlatformConfig> = {
  facebook: {
    constructPostUrl: (postId: string) =>
      `https://facebook.com/posts/${postId}`,
    extractPostId: (element) => {
      // Facebook post IDs are complex, try to get from URL
      const match = window.location.pathname.match(/\/posts\/([^/]+)/);
      if (match) {
        return match[1];
      }

      // Try story_fbid from URL
      const urlParams = new URLSearchParams(window.location.search);
      const storyId = urlParams.get('story_fbid');
      if (storyId) {
        return storyId;
      }

      // Try to get from element data attributes
      if (element) {
        const article = element.closest('div[role="article"]');
        if (article) {
          const href = article.querySelector('a[href*="/posts/"]');
          if (href) {
            const hrefMatch = href
              .getAttribute('href')
              ?.match(/\/posts\/([^/?]+)/);
            if (hrefMatch) {
              return hrefMatch[1];
            }
          }
        }
      }

      return null;
    },
    hostnames: ['facebook.com', 'www.facebook.com'],
    name: 'Facebook',
    platform: Platform.FACEBOOK,
    selectors: {
      actionsContainer: 'div[aria-label*="actions"]',
      postContainer: 'div[role="article"]',
      postIdentifier: 'div[role="article"]',
      replyTextarea:
        'div[contenteditable="true"][role="textbox"], div[aria-label*="comment"]',
      submitButton: 'div[aria-label*="Post"] div[role="button"]',
    },
    // URL patterns for different Facebook sections (feed, marketplace, etc.)
    urlPatterns: [
      /^\/$/, // Home feed
      /^\/marketplace/, // Marketplace
      /^\/watch/, // Watch
      /^\/groups/, // Groups
      /^\/pages/, // Pages
      /^\/events/, // Events
    ],
  },

  facebookMarketplace: {
    constructPostUrl: (postId: string) =>
      `https://facebook.com/marketplace/item/${postId}`,
    extractPostId: () => {
      const match = window.location.pathname.match(
        /\/marketplace\/item\/([^/]+)/,
      );
      return match ? match[1] : null;
    },
    hostnames: ['facebook.com', 'www.facebook.com'],
    name: 'Facebook Marketplace',
    platform: Platform.FACEBOOK,
    selectors: {
      actionsContainer:
        'div[aria-label*="Message"], div[aria-label*="Actions"], div[aria-label*="Seller actions"]',
      postContainer: 'div[role="main"] div[aria-label*="Marketplace"], article',
      postIdentifier:
        'div[role="main"] article, div[aria-label*="Marketplace"]',
      replyTextarea:
        'div[contenteditable="true"][role="textbox"], textarea[aria-label*="Message"], div[aria-label*="Message"]',
      submitButton:
        'div[aria-label*="Send"] div[role="button"], div[aria-label*="Message"] div[role="button"]',
    },
    urlPatterns: [/\/marketplace\//],
  },

  instagram: {
    constructPostUrl: (postId: string) =>
      SocialUrlHelper.buildInstagramUrl(postId),
    extractPostId: (_element) => {
      // Instagram post IDs are in the URL
      const match = window.location.pathname.match(/\/p\/([^/]+)/);
      if (match) {
        return match[1];
      }

      // Try reel
      const reelMatch = window.location.pathname.match(/\/reel\/([^/]+)/);
      if (reelMatch) {
        return reelMatch[1];
      }

      return null;
    },
    hostnames: ['instagram.com', 'www.instagram.com'],
    name: 'Instagram',
    platform: Platform.INSTAGRAM,
    selectors: {
      actionsContainer: 'section[class*="x78zum5"]',
      postContainer: 'article[role="presentation"]',
      postIdentifier: 'article',
      replyTextarea: 'textarea[placeholder*="comment"]',
      submitButton: 'button[type="submit"]',
    },
  },

  linkedin: {
    constructPostUrl: (postId: string) =>
      SocialUrlHelper.buildLinkedInUrl(postId),
    extractPostId: (element) => {
      // LinkedIn post IDs are in the data-urn attribute
      if (element) {
        const post = element.closest('[data-urn*="activity"]');
        if (post) {
          const urn = post.getAttribute('data-urn');
          if (urn) {
            const match = urn.match(/activity:(\d+)/);
            if (match) {
              return match[1];
            }
          }
        }
      }

      // Try URL
      const match = window.location.pathname.match(/\/feed\/update\/([^/]+)/);
      if (match) {
        return match[1];
      }

      return null;
    },
    hostnames: ['linkedin.com', 'www.linkedin.com'],
    name: 'LinkedIn',
    platform: Platform.LINKEDIN,
    selectors: {
      actionsContainer:
        'div.social-actions-button, div[class*="feed-shared-social-action-bar"]',
      postContainer: 'div[data-urn*="activity"], article[data-urn*="activity"]',
      postIdentifier: 'div[data-urn*="activity"]',
      replyTextarea: 'div[contenteditable="true"], div[role="textbox"]',
      submitButton:
        'button[type="submit"], button[class*="comments-comment-box__submit-button"]',
    },
  },

  reddit: {
    constructPostUrl: (postId: string) =>
      `https://reddit.com/comments/${postId}`,
    extractPostId: (element) => {
      // Reddit post IDs are in the URL
      const match = window.location.pathname.match(/\/comments\/([a-z0-9]+)\//);
      if (match) {
        return match[1];
      }

      // Try to get from element
      if (element) {
        const post =
          element.closest('shreddit-post') ||
          element.closest('[data-testid="post-container"]');
        if (post) {
          const postId =
            post.getAttribute('id') || post.getAttribute('data-post-id');
          if (postId) {
            return postId;
          }
        }
      }

      return null;
    },
    hostnames: ['reddit.com', 'www.reddit.com', 'old.reddit.com'],
    name: 'Reddit',
    platform: Platform.REDDIT,
    selectors: {
      actionsContainer:
        'div[slot="comment-actions"], div[data-testid="post-container"] button',
      postContainer: 'shreddit-post, div[data-testid="post-container"]',
      postIdentifier: 'shreddit-post, div.thing',
      replyTextarea: 'div[contenteditable="true"], textarea[name="comment"]',
      submitButton: 'button[type="submit"]',
    },
  },

  tiktok: {
    constructPostUrl: (postId: string) => {
      // Extract username from current URL if available
      const usernameMatch = window.location.pathname.match(/@([^/]+)\/video/);
      if (usernameMatch) {
        return SocialUrlHelper.buildTikTokUrl(postId, usernameMatch[1]);
      }
      return SocialUrlHelper.buildTikTokUrl(postId);
    },
    extractPostId: (_element) => {
      // TikTok video IDs are in the URL
      const match = window.location.pathname.match(/\/video\/(\d+)/);
      if (match) {
        return match[1];
      }

      // Try @username/video format
      const altMatch = window.location.pathname.match(/@[^/]+\/video\/(\d+)/);
      if (altMatch) {
        return altMatch[1];
      }

      return null;
    },
    hostnames: ['tiktok.com', 'www.tiktok.com'],
    name: 'TikTok',
    platform: Platform.TIKTOK,
    selectors: {
      actionsContainer: 'div[data-e2e="comment-actions"]',
      postContainer: 'div[data-e2e="comment-item"]',
      postIdentifier: 'div[data-e2e="comment-item"]',
      replyTextarea: 'div[contenteditable="true"]',
      submitButton: 'div[data-e2e="comment-post"]',
    },
  },
  twitter: {
    constructPostUrl: (postId: string) => {
      // Extract username from current URL if available
      const currentUrl = SocialUrlHelper.parseTwitterUrl(window.location.href);
      if (currentUrl?.username) {
        return SocialUrlHelper.buildTwitterUrl(postId, currentUrl.username);
      }
      // Fallback: build without username (less ideal but works)
      return `https://x.com/i/status/${postId}`;
    },
    extractPostId: (element) => {
      // Try to parse from URL using shared helper
      const urlData = SocialUrlHelper.parseTwitterUrl(window.location.href);
      if (urlData?.tweetId) {
        return urlData.tweetId;
      }

      // Fallback: extract from element
      if (element) {
        const article = element.closest('article');
        if (!article) {
          return null;
        }
        const statusLink = article.querySelector('a[href*="/status/"]');
        if (statusLink) {
          const href = statusLink.getAttribute('href');
          if (href) {
            const parsed = SocialUrlHelper.parseTwitterUrl(href);
            if (parsed?.tweetId) {
              return parsed.tweetId;
            }
          }
        }
      }

      return null;
    },
    hostnames: ['twitter.com', 'x.com'],
    name: 'Twitter/X',
    platform: Platform.TWITTER,
    selectors: {
      actionsContainer: '[role="group"]',
      postContainer: 'article[data-testid="tweet"]',
      postIdentifier: 'article',
      replyTextarea: '[data-testid="tweetTextarea_0"]',
      submitButton: '[data-testid="tweetButtonInline"]',
    },
  },

  youtube: {
    constructPostUrl: (postId: string) =>
      SocialUrlHelper.buildYoutubeUrl(postId),
    extractPostId: (element) => {
      // For YouTube comments, use the comment ID from the DOM
      if (element) {
        const commentThread = element.closest('ytd-comment-thread-renderer');
        if (commentThread) {
          const commentId = commentThread.getAttribute('id');
          if (commentId) {
            return commentId;
          }
        }
      }
      // For videos, use video ID from URL
      const urlParams = new URLSearchParams(window.location.search);
      return urlParams.get('v');
    },
    hostnames: ['youtube.com', 'www.youtube.com'],
    name: 'YouTube',
    platform: Platform.YOUTUBE,
    selectors: {
      actionsContainer: '#toolbar',
      postContainer: 'ytd-comment-thread-renderer',
      postIdentifier: 'ytd-comment-thread-renderer, ytd-comment-renderer',
      replyTextarea: '#contenteditable-root',
      submitButton: '#submit-button button',
    },
  },
};

// Get current platform based on hostname and URL patterns
export function getCurrentPlatform(): PlatformConfig | null {
  const hostname = window.location.hostname;
  const url = window.location.href;
  const pathname = window.location.pathname;

  for (const [_key, platform] of Object.entries(platforms)) {
    // Check hostname match
    const hostnameMatches = platform.hostnames.some((h) =>
      hostname.includes(h),
    );

    // Check URL pattern match (if patterns are defined)
    const urlMatches = platform.urlPatterns
      ? platform.urlPatterns.some(
          (pattern) => pattern.test(url) || pattern.test(pathname),
        )
      : true; // If no patterns defined, match any URL on the hostname

    // Platform matches if hostname matches AND (no urlPatterns OR urlPatterns match)
    if (hostnameMatches && urlMatches) {
      return platform;
    }
  }
  return null;
}

// Get platform name for API calls
export function getPlatformName(): string {
  const platform = getCurrentPlatform();
  if (!platform) {
    return 'unknown';
  }

  // Return the enum value directly (already lowercase and API-friendly)
  return platform.platform;
}

// Export Platform enum for use in other files
export { Platform };
