import type { PlatformConfig } from '~platforms/config';
import { findElement } from '~platforms/twitter-selectors';

export interface ComposerActionResult {
  error?: string;
  success: boolean;
}

export interface ComposerState {
  composeBoxAvailable: boolean;
}

function isTwitterHost(hostname: string): boolean {
  return hostname.includes('twitter.com') || hostname.includes('x.com');
}

function dispatchComposerInputEvents(element: HTMLElement): void {
  element.dispatchEvent(new Event('input', { bubbles: true }));
  element.dispatchEvent(new Event('change', { bubbles: true }));
  element.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
}

function findComposeBox(platform: PlatformConfig | null): HTMLElement | null {
  if (!platform) {
    return null;
  }

  const selector = platform.selectors.replyTextarea;
  const candidate = selector
    ? (document.querySelector(selector) as HTMLElement | null)
    : null;

  if (candidate) {
    return candidate;
  }

  if (isTwitterHost(window.location.hostname)) {
    return findElement('replyTextarea');
  }

  return null;
}

export function getComposerState(
  platform: PlatformConfig | null,
): ComposerState {
  const composeBox = findComposeBox(platform);

  return {
    composeBoxAvailable: Boolean(composeBox),
  };
}

export function insertContentIntoComposer(
  content: string,
  platform: PlatformConfig | null,
): ComposerActionResult {
  const composeBox = findComposeBox(platform);

  if (!composeBox) {
    return {
      error: 'Compose box not found on the active page.',
      success: false,
    };
  }

  composeBox.focus();

  if (
    composeBox instanceof HTMLTextAreaElement ||
    composeBox instanceof HTMLInputElement
  ) {
    composeBox.value = content;
    dispatchComposerInputEvents(composeBox);
    return { success: true };
  }

  if (composeBox.getAttribute('contenteditable') === 'true') {
    composeBox.textContent = '';

    if (typeof document.execCommand === 'function') {
      document.execCommand('insertText', false, content);
    } else {
      composeBox.textContent = content;
    }

    dispatchComposerInputEvents(composeBox);
    return { success: true };
  }

  return {
    error: 'Unsupported composer element type.',
    success: false,
  };
}
