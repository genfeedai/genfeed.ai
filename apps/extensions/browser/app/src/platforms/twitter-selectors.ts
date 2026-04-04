/**
 * Twitter/X DOM Selectors with Fallback Chains
 *
 * Twitter frequently changes their DOM structure. This module provides
 * resilient selector chains that fallback through multiple options.
 *
 * Priority order for each selector:
 * 1. data-testid (Twitter's test IDs - most reliable but can change)
 * 2. ARIA roles/labels (semantic, stable)
 * 3. Class patterns (less reliable)
 * 4. Semantic detection (last resort)
 */

import { logger } from '~utils/logger.util';

export interface SelectorConfig {
  primary: string;
  fallbacks: string[];
  semantic?: () => HTMLElement | null;
  description: string;
}

/**
 * All Twitter selectors with fallback chains
 */
export const TWITTER_SELECTORS: Record<string, SelectorConfig> = {
  // Actions container (like, reply, retweet buttons)
  actionsContainer: {
    description: 'Tweet actions container',
    fallbacks: [
      'article [role="group"]',
      '[data-testid="tweet"] [role="group"]',
    ],
    primary: '[role="group"]',
  },

  // File input for media upload
  fileInput: {
    description: 'Media file upload input',
    fallbacks: [
      'input[type="file"][accept*="image"][accept*="video"]',
      'input[type="file"][accept*="image"]',
      'input[type="file"][multiple][accept]',
      'input[type="file"]',
    ],
    primary: '[data-testid="fileInput"]',
    semantic: findFileInputSemantic,
  },

  // Media button (to reveal file input)
  mediaButton: {
    description: 'Media upload button',
    fallbacks: [
      '[aria-label*="Add photos"]',
      '[aria-label*="Add media"]',
      '[aria-label*="Media"]',
      '[data-testid="geoButton"]', // Near media button
    ],
    primary: '[data-testid="fileInput"]',
  },
  // Reply/Compose textarea
  replyTextarea: {
    description: 'Reply/compose text input',
    fallbacks: [
      '[data-testid="tweetTextarea_0_label"] + div [contenteditable="true"]',
      '[role="textbox"][data-text="true"]',
      '.public-DraftEditor-content[contenteditable="true"]',
      'div[contenteditable="true"][data-block="true"]',
      '[aria-label*="Tweet text"] [contenteditable="true"]',
      '[aria-label*="Post text"] [contenteditable="true"]',
    ],
    primary: '[data-testid="tweetTextarea_0"]',
    semantic: findReplyTextareaSemantic,
  },

  // Submit/Post button
  submitButton: {
    description: 'Post/Reply submit button',
    fallbacks: [
      '[data-testid="tweetButton"]',
      '[role="button"][data-testid*="tweet"]',
      'button[type="submit"]',
      '[aria-label*="Post"][role="button"]',
      '[aria-label*="Tweet"][role="button"]',
      '[aria-label*="Reply"][role="button"]',
    ],
    primary: '[data-testid="tweetButtonInline"]',
    semantic: findSubmitButtonSemantic,
  },

  // Tweet container
  tweetContainer: {
    description: 'Individual tweet container',
    fallbacks: [
      'article[data-testid="tweet"]',
      'article[role="article"]',
      '[data-testid="cellInnerDiv"] article',
      'div[data-testid="tweetDetail"]',
    ],
    primary: '[data-testid="tweet"]',
  },

  // Tweet text content
  tweetText: {
    description: 'Tweet text content',
    fallbacks: [
      'article [data-testid="tweetText"]',
      'article [lang] span',
      '[data-testid="tweet"] [lang]',
    ],
    primary: '[data-testid="tweetText"]',
  },

  // User name display
  userName: {
    description: 'Tweet author name',
    fallbacks: [
      '[data-testid="User-Names"]',
      'a[role="link"][href*="/"] span',
      '[data-testid="tweet"] a[href*="/"] span',
    ],
    primary: '[data-testid="User-Name"]',
  },
};

/**
 * Find an element using the selector chain with fallbacks
 */
export function findElement(
  selectorKey: keyof typeof TWITTER_SELECTORS,
  context: Document | Element = document,
): HTMLElement | null {
  const config = TWITTER_SELECTORS[selectorKey];
  if (!config) {
    logger.error(`Unknown selector key: ${selectorKey}`);
    return null;
  }

  // Try primary selector
  let element = context.querySelector(config.primary) as HTMLElement | null;
  if (element) {
    logger.log(`Found ${selectorKey} with primary selector`);
    return element;
  }

  // Try fallback selectors
  for (let i = 0; i < config.fallbacks.length; i++) {
    element = context.querySelector(config.fallbacks[i]) as HTMLElement | null;
    if (element) {
      logger.log(
        `Found ${selectorKey} with fallback[${i}]: ${config.fallbacks[i]}`,
      );
      return element;
    }
  }

  // Try semantic detection as last resort
  if (config.semantic) {
    element = config.semantic();
    if (element) {
      logger.log(`Found ${selectorKey} with semantic detection`);
      return element;
    }
  }

  logger.warn(`Could not find ${selectorKey} with any selector`, {
    description: config.description,
  });
  return null;
}

/**
 * Find all elements matching the selector chain
 */
export function findAllElements(
  selectorKey: keyof typeof TWITTER_SELECTORS,
  context: Document | Element = document,
): HTMLElement[] {
  const config = TWITTER_SELECTORS[selectorKey];
  if (!config) {
    logger.error(`Unknown selector key: ${selectorKey}`);
    return [];
  }

  // Combine all selectors
  const allSelectors = [config.primary, ...config.fallbacks];

  for (const selector of allSelectors) {
    const elements = Array.from(
      context.querySelectorAll(selector),
    ) as HTMLElement[];
    if (elements.length > 0) {
      logger.log(
        `Found ${elements.length} ${selectorKey} elements with: ${selector}`,
      );
      return elements;
    }
  }

  return [];
}

// ============================================
// Semantic Detection Functions
// ============================================

/**
 * Find reply textarea by characteristics, not selectors
 */
function findReplyTextareaSemantic(): HTMLElement | null {
  const candidates = document.querySelectorAll('[contenteditable="true"]');

  for (const el of candidates) {
    const element = el as HTMLElement;

    // Check characteristics
    const isInReplyContext =
      element.closest('[aria-label*="reply"]') !== null ||
      element.closest('[aria-label*="Reply"]') !== null ||
      element.closest('[data-testid*="reply"]') !== null;

    const hasTextboxRole = element.getAttribute('role') === 'textbox';
    const isVisible = element.offsetParent !== null;
    const isReasonableSize =
      element.offsetHeight > 20 && element.offsetHeight < 500;
    const isNotTooSmall = element.offsetWidth > 100;

    // Score the candidate
    let score = 0;
    if (isInReplyContext) {
      score += 3;
    }
    if (hasTextboxRole) {
      score += 2;
    }
    if (isVisible) {
      score += 1;
    }
    if (isReasonableSize) {
      score += 1;
    }
    if (isNotTooSmall) {
      score += 1;
    }

    if (score >= 4) {
      return element;
    }
  }

  return null;
}

/**
 * Find file input by characteristics
 */
function findFileInputSemantic(): HTMLInputElement | null {
  const inputs = document.querySelectorAll('input[type="file"]');

  for (const input of inputs) {
    const element = input as HTMLInputElement;
    const accept = element.getAttribute('accept') || '';

    // Check if it accepts images or videos
    const acceptsMedia =
      accept.includes('image') ||
      accept.includes('video') ||
      accept.includes('gif');

    // Check if it's in a compose/reply context
    const isInComposeContext =
      element.closest('[data-testid*="tweet"]') !== null ||
      element.closest('[aria-label*="compose"]') !== null ||
      element.closest('form') !== null;

    if (acceptsMedia || isInComposeContext) {
      return element;
    }
  }

  return null;
}

/**
 * Find submit button by characteristics
 */
function findSubmitButtonSemantic(): HTMLElement | null {
  const buttons = document.querySelectorAll(
    'button, [role="button"], div[tabindex="0"]',
  );

  for (const btn of buttons) {
    const element = btn as HTMLElement;
    const ariaLabel = element.getAttribute('aria-label')?.toLowerCase() || '';
    const innerText = element.textContent?.toLowerCase() || '';

    // Check for post/tweet/reply labels
    const isPostButton =
      ariaLabel.includes('post') ||
      ariaLabel.includes('tweet') ||
      ariaLabel.includes('reply') ||
      innerText.includes('post') ||
      innerText.includes('tweet') ||
      innerText.includes('reply');

    // Check if it's in a compose context
    const isInComposeContext =
      element.closest('[data-testid*="tweetTextarea"]') !== null ||
      element.closest('form') !== null;

    // Check if it looks like a primary action button
    const isPrimary =
      element.closest('[data-testid*="Button"]') !== null ||
      element.getAttribute('type') === 'submit';

    if (isPostButton && (isInComposeContext || isPrimary)) {
      return element;
    }
  }

  return null;
}

// ============================================
// Utility Functions
// ============================================

/**
 * Wait for an element to appear in the DOM
 */
export function waitForElement(
  selectorKey: keyof typeof TWITTER_SELECTORS,
  timeout = 5000,
): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    // Check if already exists
    const existing = findElement(selectorKey);
    if (existing) {
      resolve(existing);
      return;
    }

    // Set up observer
    const observer = new MutationObserver(() => {
      const element = findElement(selectorKey);
      if (element) {
        observer.disconnect();
        resolve(element);
      }
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });

    // Timeout
    setTimeout(() => {
      observer.disconnect();
      resolve(null);
    }, timeout);
  });
}

/**
 * Check if Twitter's DOM structure has significantly changed
 * Returns true if primary selectors are mostly failing
 */
export function checkSelectorHealth(): {
  healthy: boolean;
  failingSelectors: string[];
} {
  const criticalSelectors: (keyof typeof TWITTER_SELECTORS)[] = [
    'replyTextarea',
    'tweetContainer',
    'tweetText',
  ];

  const failingSelectors: string[] = [];

  for (const key of criticalSelectors) {
    const config = TWITTER_SELECTORS[key];
    const primaryWorks = document.querySelector(config.primary) !== null;

    if (!primaryWorks) {
      failingSelectors.push(key);
    }
  }

  return {
    failingSelectors,
    healthy: failingSelectors.length === 0,
  };
}
