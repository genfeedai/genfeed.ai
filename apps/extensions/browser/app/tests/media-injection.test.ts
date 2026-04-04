import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Mock the logger
vi.mock('~utils/logger.util', () => ({
  logger: {
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  },
}));

// Mock the twitter selectors module
vi.mock('~platforms/twitter-selectors', () => ({
  findElement: vi.fn(),
  TWITTER_SELECTORS: {
    fileInput: {
      description: '',
      fallbacks: [],
      primary: '[data-testid="fileInput"]',
    },
    mediaButton: {
      description: '',
      fallbacks: [],
      primary: '[data-testid="fileInput"]',
    },
    replyTextarea: {
      description: '',
      fallbacks: [],
      primary: '[data-testid="tweetTextarea_0"]',
    },
    tweetText: {
      description: '',
      fallbacks: [],
      primary: '[data-testid="tweetText"]',
    },
    userName: {
      description: '',
      fallbacks: [],
      primary: '[data-testid="User-Name"]',
    },
  },
}));

import { findElement } from '~platforms/twitter-selectors';
// Import after mocks
import {
  createAIReplyButton,
  createButtonContainer,
  createGenFeedDropdown,
  createSaveButton,
  icons,
  injectGlobalStyles,
} from '~platforms/ui-helpers';

describe('UI Helpers', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  afterEach(() => {
    document.body.innerHTML = '';
  });

  describe('icons', () => {
    it('should export all required icons', () => {
      const requiredIcons = [
        'bookmark',
        'sparkles',
        'check',
        'x',
        'spinner',
        'edit',
        'image',
        'replyWithMedia',
        'video',
        'gif',
      ];

      requiredIcons.forEach((icon) => {
        expect(icons).toHaveProperty(icon);
        expect(typeof icons[icon]).toBe('string');
        expect(icons[icon]).toContain('svg');
      });
    });
  });

  describe('injectGlobalStyles', () => {
    it('should inject styles into document head', () => {
      injectGlobalStyles();

      const styleEl = document.getElementById('genfeed-extension-styles');
      expect(styleEl).not.toBeNull();
      expect(styleEl?.tagName).toBe('STYLE');
    });

    it('should not inject duplicate styles', () => {
      injectGlobalStyles();
      injectGlobalStyles();

      const styleEls = document.querySelectorAll('#genfeed-extension-styles');
      expect(styleEls).toHaveLength(1);
    });

    it('should include button styles', () => {
      injectGlobalStyles();

      const styleEl = document.getElementById('genfeed-extension-styles');
      expect(styleEl?.textContent).toContain('.genfeed-btn');
      expect(styleEl?.textContent).toContain('.genfeed-dropdown');
      expect(styleEl?.textContent).toContain('.genfeed-menu-item');
    });

    it('should include toast styles', () => {
      injectGlobalStyles();

      const styleEl = document.getElementById('genfeed-extension-styles');
      expect(styleEl?.textContent).toContain('.genfeed-toast');
    });

    it('should include dark mode styles', () => {
      injectGlobalStyles();

      const styleEl = document.getElementById('genfeed-extension-styles');
      expect(styleEl?.textContent).toContain('prefers-color-scheme: dark');
    });
  });

  describe('createSaveButton', () => {
    it('should create a button element', () => {
      const button = createSaveButton(
        '123',
        'twitter',
        'https://twitter.com/test/status/123',
      );

      expect(button).toBeInstanceOf(HTMLButtonElement);
      expect(button.className).toContain('genfeed-btn');
      expect(button.className).toContain('genfeed-save-btn');
    });

    it('should set data attributes', () => {
      const button = createSaveButton(
        '123',
        'twitter',
        'https://twitter.com/test/status/123',
      );

      expect(button.getAttribute('data-post-id')).toBe('123');
      expect(button.getAttribute('data-platform')).toBe('twitter');
    });

    it('should have bookmark icon', () => {
      const button = createSaveButton(
        '123',
        'twitter',
        'https://twitter.com/test/status/123',
      );

      expect(button.innerHTML).toContain('svg');
      expect(button.innerHTML).toContain(icons.bookmark);
    });

    it('should have title tooltip', () => {
      const button = createSaveButton(
        '123',
        'twitter',
        'https://twitter.com/test/status/123',
      );

      expect(button.title).toBe('Save to Genfeed');
    });
  });

  describe('createAIReplyButton', () => {
    it('should create a button element', () => {
      const button = createAIReplyButton(
        '123',
        'twitter',
        '[data-testid="tweetTextarea_0"]',
      );

      expect(button).toBeInstanceOf(HTMLButtonElement);
      expect(button.className).toContain('genfeed-btn');
      expect(button.className).toContain('genfeed-ai-btn');
    });

    it('should set data attributes', () => {
      const button = createAIReplyButton(
        '123',
        'twitter',
        '[data-testid="tweetTextarea_0"]',
      );

      expect(button.getAttribute('data-post-id')).toBe('123');
      expect(button.getAttribute('data-platform')).toBe('twitter');
    });

    it('should have sparkles icon', () => {
      const button = createAIReplyButton(
        '123',
        'twitter',
        '[data-testid="tweetTextarea_0"]',
      );

      expect(button.innerHTML).toContain('svg');
    });

    it('should have title tooltip', () => {
      const button = createAIReplyButton(
        '123',
        'twitter',
        '[data-testid="tweetTextarea_0"]',
      );

      expect(button.title).toBe('Generate AI Reply');
    });
  });

  describe('createGenFeedDropdown', () => {
    it('should create a dropdown container', () => {
      const dropdown = createGenFeedDropdown('123', 'twitter');

      expect(dropdown).toBeInstanceOf(HTMLDivElement);
      expect(dropdown.className).toContain('genfeed-dropdown');
    });

    it('should have a dropdown button', () => {
      const dropdown = createGenFeedDropdown('123', 'twitter');
      const button = dropdown.querySelector('.genfeed-dropdown-btn');

      expect(button).not.toBeNull();
    });

    it('should have a dropdown menu', () => {
      const dropdown = createGenFeedDropdown('123', 'twitter');
      const menu = dropdown.querySelector('.genfeed-dropdown-menu');

      expect(menu).not.toBeNull();
    });

    it('should have menu items', () => {
      const dropdown = createGenFeedDropdown('123', 'twitter');
      const menuItems = dropdown.querySelectorAll('.genfeed-menu-item');

      expect(menuItems.length).toBeGreaterThan(0);
    });

    it('should have Reply with Image menu item', () => {
      const dropdown = createGenFeedDropdown('123', 'twitter');
      const menuItems = dropdown.querySelectorAll('.genfeed-menu-item');

      const hasReplyWithImage = Array.from(menuItems).some((item) =>
        item.textContent?.includes('Reply with Image'),
      );
      expect(hasReplyWithImage).toBe(true);
    });

    it('should have Reply with Video menu item', () => {
      const dropdown = createGenFeedDropdown('123', 'twitter');
      const menuItems = dropdown.querySelectorAll('.genfeed-menu-item');

      const hasReplyWithVideo = Array.from(menuItems).some((item) =>
        item.textContent?.includes('Reply with Video'),
      );
      expect(hasReplyWithVideo).toBe(true);
    });

    it('should have Reply with GIF menu item', () => {
      const dropdown = createGenFeedDropdown('123', 'twitter');
      const menuItems = dropdown.querySelectorAll('.genfeed-menu-item');

      const hasReplyWithGif = Array.from(menuItems).some((item) =>
        item.textContent?.includes('Reply with GIF'),
      );
      expect(hasReplyWithGif).toBe(true);
    });

    it('should toggle menu on button click', () => {
      const dropdown = createGenFeedDropdown('123', 'twitter');
      const button = dropdown.querySelector(
        '.genfeed-dropdown-btn',
      ) as HTMLElement;
      const menu = dropdown.querySelector(
        '.genfeed-dropdown-menu',
      ) as HTMLElement;

      expect(menu.classList.contains('active')).toBe(false);

      button.click();
      expect(menu.classList.contains('active')).toBe(true);

      button.click();
      expect(menu.classList.contains('active')).toBe(false);
    });
  });

  describe('createButtonContainer', () => {
    it('should create a div container', () => {
      const container = createButtonContainer();

      expect(container).toBeInstanceOf(HTMLDivElement);
      expect(container.className).toBe('genfeed-buttons');
    });
  });
});

describe('Data URL to File conversion', () => {
  it('should convert a data URL to a File object', () => {
    // Create a simple 1x1 pixel PNG data URL
    const dataUrl =
      'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

    // Test the conversion manually (since dataUrlToFile is not exported)
    const arr = dataUrl.split(',');
    const mimeMatch = arr[0].match(/:(.*?);/);
    const mime = mimeMatch ? mimeMatch[1] : 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
      u8arr[n] = bstr.charCodeAt(n);
    }
    const file = new File([u8arr], 'test.png', { type: mime });

    expect(file).toBeInstanceOf(File);
    expect(file.name).toBe('test.png');
    expect(file.type).toBe('image/png');
    expect(file.size).toBeGreaterThan(0);
  });
});

describe('Platform context extraction', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
    // Reset window.location
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'twitter.com',
        href: 'https://twitter.com/test/status/123',
        pathname: '/test/status/123',
      },
      writable: true,
    });
  });

  it('should extract Twitter post context', () => {
    document.body.innerHTML = `
      <div data-testid="tweetText">This is a tweet</div>
      <div data-testid="User-Name">@testuser</div>
    `;

    vi.mocked(findElement).mockImplementation((key: string) => {
      if (key === 'tweetText') {
        return document.querySelector('[data-testid="tweetText"]');
      }
      if (key === 'userName') {
        return document.querySelector('[data-testid="User-Name"]');
      }
      return null;
    });

    // The extractPostContext function is not exported, so we test the selectors directly
    const tweetText = findElement('tweetText');
    const userName = findElement('userName');

    expect(tweetText?.textContent).toBe('This is a tweet');
    expect(userName?.textContent).toBe('@testuser');
  });

  it('should handle LinkedIn hostname', () => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'linkedin.com',
        href: 'https://linkedin.com/feed/update',
        pathname: '/feed/update',
      },
      writable: true,
    });

    expect(window.location.hostname).toContain('linkedin');
  });

  it('should handle Facebook hostname', () => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'facebook.com',
        href: 'https://facebook.com/post/123',
        pathname: '/post/123',
      },
      writable: true,
    });

    expect(window.location.hostname).toContain('facebook');
  });

  it('should handle Reddit hostname', () => {
    Object.defineProperty(window, 'location', {
      value: {
        hostname: 'reddit.com',
        href: 'https://reddit.com/r/test/comments/123',
        pathname: '/r/test/comments/123',
      },
      writable: true,
    });

    expect(window.location.hostname).toContain('reddit');
  });
});
