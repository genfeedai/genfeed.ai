// Multi-platform content script for Genfeed Extension

import {
  getComposerState,
  insertAndPublishContent,
  insertContentIntoComposer,
  publishComposer,
} from '~platforms/composer-helpers';
import {
  getCurrentPlatform,
  getPlatformName,
  type PlatformConfig,
} from '~platforms/config';
import {
  createButtonContainer,
  createGenFeedDropdown,
  injectGlobalStyles,
} from '~platforms/ui-helpers';
import { initializeErrorTracking } from '~services/error-tracking.service';

const DEBOUNCE_DELAY_MS = 300;
const NAVIGATION_DELAY_MS = 100;
const TOAST_DURATION_MS = 3200;

let currentPlatform: PlatformConfig | null = null;
let observer: MutationObserver | null = null;
let injectTimeout: NodeJS.Timeout | null = null;

initializeErrorTracking('content');

function initializePlatformIntegration(): void {
  const platform = getCurrentPlatform();
  if (!platform) {
    // Platform not supported, cleanup if needed
    cleanup();
    return;
  }

  // If platform hasn't changed, don't re-initialize
  if (currentPlatform === platform) {
    return;
  }

  // Cleanup previous integration
  cleanup();

  // Set current platform
  currentPlatform = platform;

  // Inject global styles (only once)
  injectGlobalStyles();

  const platformName = getPlatformName();

  function injectButtons(): void {
    if (!currentPlatform) {
      return;
    }

    // Find the submit button (reply/comment button)

    const submitButton = platform.selectors.submitButton
      ? document.querySelector(platform.selectors.submitButton)
      : null;

    if (!submitButton?.parentNode) {
      return;
    }

    // Use the actions container as a fallback target for platforms without a reply box
    const actionsContainer = platform.selectors.actionsContainer
      ? document.querySelector(platform.selectors.actionsContainer)
      : null;

    const injectionTarget = (submitButton?.parentNode ??
      actionsContainer) as Element | null;
    if (!injectionTarget) {
      return;
    }

    // Check if buttons are already injected
    const existingButtons = injectionTarget.querySelector('.genfeed-buttons');
    if (existingButtons) {
      return;
    }

    // Get post ID
    const postId = currentPlatform.extractPostId();
    if (!postId) {
      return;
    }

    // Construct post URL
    const postUrl = currentPlatform.constructPostUrl(postId);

    // Create button container
    const buttonContainer = createButtonContainer();

    // Create and add Genfeed dropdown
    const dropdown = createGenFeedDropdown(postId, platformName, { postUrl });
    dropdown.style.marginRight = '8px';
    buttonContainer.appendChild(dropdown);

    // Insert button container before the submit button
    if (submitButton?.parentNode) {
      submitButton.parentNode.insertBefore(buttonContainer, submitButton);
    } else {
      injectionTarget.insertBefore(buttonContainer, injectionTarget.firstChild);
    }
  }

  function debouncedInject(): void {
    if (injectTimeout) {
      clearTimeout(injectTimeout);
    }
    injectTimeout = setTimeout(injectButtons, DEBOUNCE_DELAY_MS);
  }

  // Observe DOM changes to inject buttons when UI is ready
  observer = new MutationObserver((mutations) => {
    // Check if submit button was added or modified
    const submitButtonSelector = platform?.selectors.submitButton;
    const actionsContainerSelector = platform?.selectors.actionsContainer;

    const hasSubmitButton =
      submitButtonSelector &&
      mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeType === 1 &&
            (node as Element).querySelector?.(submitButtonSelector),
        ),
      );

    const hasActionsContainer =
      actionsContainerSelector &&
      mutations.some((mutation) =>
        Array.from(mutation.addedNodes).some(
          (node) =>
            node.nodeType === 1 &&
            (node as Element).querySelector?.(actionsContainerSelector),
        ),
      );

    if (hasSubmitButton || hasActionsContainer) {
      debouncedInject();
    }
  });

  // Start observing
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
      if (observer) {
        observer.observe(document.body, {
          childList: true,
          subtree: true,
        });
      }
      injectButtons();
    });
  } else {
    if (observer) {
      observer.observe(document.body, {
        childList: true,
        subtree: true,
      });
    }
    injectButtons();
  }
}

function cleanup(): void {
  if (observer) {
    observer.disconnect();
    observer = null;
  }
  if (injectTimeout) {
    clearTimeout(injectTimeout);
    injectTimeout = null;
  }
  // Note: We don't remove injected buttons here as they may still be valid
  // They'll be replaced when new buttons are injected
}

function checkAndReinitialize(): void {
  const newPlatform = getCurrentPlatform();
  // Re-initialize if platform changed or if we need to re-check
  if (newPlatform !== currentPlatform) {
    initializePlatformIntegration();
  }
  // Notify side panel of platform/URL change
  notifyPlatformDetected();
}

function setupNavigationListeners(): void {
  window.addEventListener('popstate', () => {
    setTimeout(checkAndReinitialize, NAVIGATION_DELAY_MS);
  });

  const originalPushState = history.pushState;
  const originalReplaceState = history.replaceState;

  history.pushState = (...args) => {
    originalPushState.apply(history, args);
    setTimeout(checkAndReinitialize, NAVIGATION_DELAY_MS);
  };

  history.replaceState = (...args) => {
    originalReplaceState.apply(history, args);
    setTimeout(checkAndReinitialize, NAVIGATION_DELAY_MS);
  };
}

// === Side Panel Integration ===

function notifyPlatformDetected(): void {
  const platform = getCurrentPlatform();
  const platformName = platform ? getPlatformName() : null;
  const composerState = getComposerState(platform);

  chrome.runtime.sendMessage({
    payload: {
      canSubmitFromComposer: composerState.canSubmit,
      composeBoxAvailable: composerState.composeBoxAvailable,
      pageContext: extractCurrentPageContext(),
      platform: platformName,
      submitButtonAvailable: composerState.submitButtonAvailable,
      url: window.location.href,
    },
    type: 'PLATFORM_DETECTED',
  });
}

function extractCurrentPageContext(): {
  url: string;
  postContent?: string;
  postAuthor?: string;
} {
  const context: { url: string; postContent?: string; postAuthor?: string } = {
    url: window.location.href,
  };

  const platform = getCurrentPlatform();
  if (!platform) {
    return context;
  }

  // Try to extract visible post content
  const postContainer = platform.selectors.postContainer
    ? document.querySelector(platform.selectors.postContainer)
    : null;

  if (postContainer) {
    const textEl = postContainer.querySelector(
      '[data-testid="tweetText"], .update-components-text, .userContent-body, ._a9zs',
    );
    if (textEl) {
      context.postContent = textEl.textContent?.trim().substring(0, 500);
    }

    const authorEl = postContainer.querySelector(
      '[data-testid="User-Name"] a, .update-components-actor__name, .author a, ._aacl',
    );
    if (authorEl) {
      context.postAuthor = authorEl.textContent?.trim();
    }
  }

  return context;
}

// Listen for messages from background/side panel
chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.type === 'GET_PAGE_CONTEXT') {
    sendResponse({
      pageContext: extractCurrentPageContext(),
      success: true,
    });
    return true;
  }

  if (message.type === 'GET_COMPOSER_STATE') {
    sendResponse({
      composer: getComposerState(getCurrentPlatform()),
      success: true,
    });
    return true;
  }

  if (message.type === 'INSERT_CONTENT') {
    const result = insertContentIntoComposer(
      String(message.content ?? ''),
      getCurrentPlatform(),
    );

    chrome.runtime.sendMessage({
      payload: { error: result.error, success: result.success },
      type: 'CONTENT_INSERTED',
    });

    sendResponse(result);
    return true;
  }

  if (message.type === 'PUBLISH_CONTENT') {
    const result = publishComposer(getCurrentPlatform());

    chrome.runtime.sendMessage({
      payload: { error: result.error, success: result.success },
      type: 'CONTENT_PUBLISHED',
    });

    sendResponse(result);
    return true;
  }

  if (message.type === 'INSERT_AND_PUBLISH_CONTENT') {
    const result = insertAndPublishContent(
      String(message.content ?? ''),
      getCurrentPlatform(),
    );

    chrome.runtime.sendMessage({
      payload: { error: result.error, success: result.success },
      type: 'CONTENT_PUBLISHED',
    });

    sendResponse(result);
    return true;
  }
});

// === Keyboard Shortcuts ===
// Cmd/Ctrl+Shift+R → Remix
// Cmd/Ctrl+Shift+Y → Reply
// Cmd/Ctrl+Shift+I → Idea (save highlighted text)

function getSelectedText(): string {
  return window.getSelection()?.toString().trim() ?? '';
}

function getCurrentPageText(): string {
  // Try selected text first, fall back to page title + meta description
  const selected = getSelectedText();
  if (selected) {
    return selected;
  }

  const metaDesc =
    document
      .querySelector<HTMLMetaElement>('meta[name="description"]')
      ?.content.trim() ?? '';
  return metaDesc || document.title;
}

document.addEventListener('keydown', (event: KeyboardEvent) => {
  const isMod = event.metaKey || event.ctrlKey;
  const isShift = event.shiftKey;

  if (!isMod || !isShift) {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === 'r') {
    event.preventDefault();
    const content = getCurrentPageText();
    chrome.runtime.sendMessage({
      event: 'SHORTCUT_REMIX',
      payload: { content, url: window.location.href },
    });
    return;
  }

  if (key === 'y') {
    event.preventDefault();
    const context = extractCurrentPageContext();
    chrome.runtime.sendMessage({
      event: 'SHORTCUT_REPLY',
      payload: {
        content: context.postContent ?? document.title,
        url: context.url,
      },
    });
    return;
  }

  if (key === 'i') {
    event.preventDefault();
    const content = getSelectedText() || document.title;
    chrome.runtime.sendMessage({
      event: 'SHORTCUT_IDEA',
      payload: { content, url: window.location.href },
    });
  }
});

// Initial setup
setupNavigationListeners();
initializePlatformIntegration();

// Notify side panel of initial platform detection
notifyPlatformDetected();

// Initialize Twitter image hover if on Twitter
const platform = getCurrentPlatform();
if (platform?.name === 'Twitter/X') {
  initializeTwitterImageHover();
}

function initializeTwitterImageHover(): void {
  const PROCESSED_ATTR = 'data-genfeed-image-processed';
  const toastTimeouts: Set<number> = new Set();

  function showToast(message: string, isError: boolean = false): void {
    const toast = document.createElement('div');
    toast.className = `genfeed-toast${isError ? ' genfeed-toast-error' : ''}`;
    toast.textContent = message;
    document.body.appendChild(toast);

    const timeout = window.setTimeout(() => {
      toast.remove();
      toastTimeouts.delete(timeout);
    }, TOAST_DURATION_MS);

    toastTimeouts.add(timeout);
  }

  function buildPrompt(image: HTMLImageElement): string {
    const altText = image.getAttribute('alt');
    if (altText && altText.trim().length > 0) {
      return `Create an image inspired by this Twitter photo. Use the reference image and this context: ${altText}`;
    }

    return 'Create an image inspired by this Twitter photo using the reference image.';
  }

  function attachPromptButton(image: HTMLImageElement): void {
    if (image.getAttribute(PROCESSED_ATTR)) {
      return;
    }

    const container = image.parentElement;
    if (!container) {
      return;
    }

    const computedPosition = getComputedStyle(container).position;
    if (computedPosition === 'static') {
      container.style.position = 'relative';
    }

    container.classList.add('genfeed-image-hoverable');

    const overlay = document.createElement('div');
    overlay.className = 'genfeed-image-overlay';

    const promptButton = document.createElement('button');
    promptButton.type = 'button';
    promptButton.className = 'genfeed-image-action';
    promptButton.textContent = 'Prompt with Genfeed';

    promptButton.addEventListener('click', (event) => {
      event.preventDefault();
      event.stopPropagation();

      if (promptButton.disabled) {
        return;
      }

      promptButton.disabled = true;
      const originalLabel = promptButton.textContent;
      promptButton.textContent = 'Preparing...';

      const referenceImage = image.currentSrc || image.src;
      const prompt = buildPrompt(image);

      chrome.runtime.sendMessage(
        {
          event: 'generateImage',
          prompt,
          referenceImage,
        },
        (response) => {
          if (response?.success && response.imageUrl) {
            showToast('Image prompt sent! Check Genfeed to view the output.');
          } else {
            showToast(
              response?.error || 'Failed to send reference image to Genfeed.',
              true,
            );
          }

          promptButton.disabled = false;
          promptButton.textContent = originalLabel;
        },
      );
    });

    overlay.appendChild(promptButton);
    container.appendChild(overlay);

    image.setAttribute(PROCESSED_ATTR, 'true');
  }

  function scanImages(): void {
    const tweetImages = document.querySelectorAll<HTMLImageElement>(
      'article[data-testid="tweet"] img[src*="twimg.com"]',
    );

    tweetImages.forEach((image) => {
      attachPromptButton(image);
    });
  }

  const observer = new MutationObserver(() => {
    scanImages();
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });

  if (document.readyState === 'complete') {
    scanImages();
  } else {
    window.addEventListener('load', scanImages, { once: true });
  }
}
