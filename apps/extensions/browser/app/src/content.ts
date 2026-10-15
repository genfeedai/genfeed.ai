import type { PublicationCapturePlatform } from '@genfeedai/contracts/interfaces/extension/extension-publication-observer.interface';
import { attachLinkedInPublicationObserver } from '~platforms/linkedin-publication-observer';
import { attachXPublicationObserver } from '~platforms/x-publication-observer';
// Multi-platform content script for Genfeed Extension

import {
  activateComposer,
  captureComposerText,
  getComposerState,
  insertContentIntoComposer,
} from '~platforms/composer-helpers';
import {
  getCurrentPlatform,
  getPlatformName,
  type PlatformConfig,
} from '~platforms/config';
import {
  attachSourceButton,
  attachSourceMenuItem,
  createImageSourceActions,
} from '~platforms/source-capture-control';
import {
  findTextActionSession,
  registerTextActionSession,
  TextActionSession,
} from '~platforms/text-action-session';
import {
  createButtonContainer,
  createGenFeedDropdown,
  injectGlobalStyles,
  watchContentTheme,
} from '~platforms/ui-helpers';
import { initializeErrorTracking } from '~services/error-tracking.service';
import { publicationCapturePlatform } from '~services/publication-capture-validation';

const DEBOUNCE_DELAY_MS = 300;
const NAVIGATION_DELAY_MS = 100;
const TOAST_DURATION_MS = 3200;

const PUBLICATION_OBSERVERS: Record<
  PublicationCapturePlatform,
  () => () => void
> = {
  linkedin: attachLinkedInPublicationObserver,
  twitter: attachXPublicationObserver,
};
let stopPublicationObserver: (() => void) | null = null;
let publicationObserverPlatform: PublicationCapturePlatform | null = null;
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

  currentPlatform = platform;

  // Inject global styles (only once)
  injectGlobalStyles();

  const platformName = getPlatformName();

  function injectButtons(): void {
    if (!currentPlatform) {
      return;
    }

    attachSourceButton(currentPlatform);

    const submitButton = platform.selectors.submitButton
      ? document.querySelector(platform.selectors.submitButton)
      : null;

    if (!submitButton?.parentNode) {
      return;
    }

    const actionsContainer = platform.selectors.actionsContainer
      ? document.querySelector(platform.selectors.actionsContainer)
      : null;

    const injectionTarget = (submitButton?.parentNode ??
      actionsContainer) as Element | null;
    if (!injectionTarget) {
      return;
    }

    const existingButtons = injectionTarget.querySelector('.genfeed-buttons');
    if (existingButtons) {
      return;
    }

    const postId = currentPlatform.extractPostId();
    if (!postId) {
      return;
    }

    const postUrl = currentPlatform.constructPostUrl(postId);

    const buttonContainer = createButtonContainer();

    const dropdown = createGenFeedDropdown(postId, platformName, { postUrl });
    attachSourceMenuItem({ dropdown, platform });
    dropdown.style.marginRight = '8px';
    buttonContainer.appendChild(dropdown);

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

function synchronizePublicationObserver(): void {
  const platform = publicationCapturePlatform(location.href);
  if (stopPublicationObserver && platform !== publicationObserverPlatform) {
    stopPublicationObserver();
    stopPublicationObserver = null;
    publicationObserverPlatform = null;
  }
  if (platform && !stopPublicationObserver) {
    stopPublicationObserver = PUBLICATION_OBSERVERS[platform]();
    publicationObserverPlatform = platform;
  }
}

function checkAndReinitialize(): void {
  window.dispatchEvent(new Event('genfeed-publication-navigation'));
  synchronizePublicationObserver();
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
    synchronizePublicationObserver();
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

function notifyPlatformDetected(): void {
  const platform = getCurrentPlatform();
  const platformName = platform ? getPlatformName() : null;
  const composerState = getComposerState(platform);

  chrome.runtime.sendMessage({
    payload: {
      composeBoxAvailable: composerState.composeBoxAvailable,
      pageContext: extractCurrentPageContext(),
      platform: platformName,
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

  // Text actions started from the side panel: the page keeps the captured
  // composer text, the panel only holds the id of what it may apply.
  if (message.type === 'CAPTURE_COMPOSER_TEXT') {
    const captured = captureComposerText(getCurrentPlatform());
    sendResponse(
      'error' in captured
        ? { error: captured.error, success: false }
        : {
            scope: captured.snapshot.scope,
            snapshotId: registerTextActionSession(
              new TextActionSession(captured.snapshot),
            ),
            success: true,
            text: captured.snapshot.text,
          },
    );
    return true;
  }

  if (message.type === 'APPLY_COMPOSER_TEXT') {
    const session = findTextActionSession(message.snapshotId);
    if (!session) {
      sendResponse({
        error: 'This suggestion expired. Run the action again.',
        success: false,
      });
      return true;
    }
    const written = session.apply(String(message.text ?? ''));
    if ('error' in written) {
      sendResponse({ error: written.error, success: false });
      return true;
    }
    chrome.runtime.sendMessage({
      payload: { content: written.applied.draftAfter, success: true },
      type: 'CONTENT_INSERTED',
    });
    sendResponse({ success: true });
    return true;
  }

  if (message.type === 'UNDO_COMPOSER_TEXT') {
    const session = findTextActionSession(message.snapshotId);
    sendResponse(
      session
        ? session.undo()
        : { error: 'This suggestion expired.', success: false },
    );
    return true;
  }

  if (message.type === 'INSERT_CONTENT') {
    const platform = getCurrentPlatform();
    const content = String(message.content ?? '');
    // A collapsed reply box (YouTube, Reddit) is opened first; the text is
    // only placed in it, never submitted.
    void activateComposer(platform).then(() => {
      const result = insertContentIntoComposer(content, platform);

      chrome.runtime.sendMessage({
        payload: {
          // Lets the background know this text was written by the extension.
          content: result.success ? content : undefined,
          error: result.error,
          success: result.success,
        },
        type: 'CONTENT_INSERTED',
      });

      sendResponse(result);
    });
    return true;
  }
});

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
        author: context.postAuthor,
        content: context.postContent ?? document.title,
        platform: getPlatformName(),
        url: context.url,
      },
    });
    return;
  }

  if (key === 'i') {
    event.preventDefault();
    chrome.runtime.sendMessage({
      event: 'SHORTCUT_IDEA',
      payload: {
        content: '',
        url: window.location.href,
        captureMode: getSelectedText() ? 'selection' : 'page',
      },
    });
  }
});

// Initial setup
synchronizePublicationObserver();
window.addEventListener('pagehide', () => {
  stopPublicationObserver?.();
  stopPublicationObserver = null;
});
// A page restored from the back/forward cache keeps its content script alive
// but pagehide already detached the observer.
window.addEventListener('pageshow', (event) => {
  if (event.persisted) synchronizePublicationObserver();
});
watchContentTheme();
setupNavigationListeners();
initializePlatformIntegration();

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
    for (const action of createImageSourceActions(image)) {
      overlay.appendChild(action);
    }
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
