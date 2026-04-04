import type { PlatformConfig } from '~platforms/config';
import { findElement } from '~platforms/twitter-selectors';

export interface ComposerActionResult {
  error?: string;
  success: boolean;
}

export interface ComposerState {
  canSubmit: boolean;
  composeBoxAvailable: boolean;
  submitButtonAvailable: boolean;
}

function isTwitterHost(hostname: string): boolean {
  return hostname.includes('twitter.com') || hostname.includes('x.com');
}

function isButtonDisabled(button: HTMLElement): boolean {
  if (button.hasAttribute('disabled')) {
    return true;
  }

  const ariaDisabled = button.getAttribute('aria-disabled');
  if (ariaDisabled === 'true') {
    return true;
  }

  const nativeButton = button as HTMLButtonElement;
  return Boolean(nativeButton.disabled);
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

function findSubmitButton(platform: PlatformConfig | null): HTMLElement | null {
  if (!platform?.selectors.submitButton) {
    return isTwitterHost(window.location.hostname)
      ? findElement('submitButton')
      : null;
  }

  const candidate = document.querySelector(
    platform.selectors.submitButton,
  ) as HTMLElement | null;

  if (candidate) {
    return candidate;
  }

  if (isTwitterHost(window.location.hostname)) {
    return findElement('submitButton');
  }

  return null;
}

export function getComposerState(
  platform: PlatformConfig | null,
): ComposerState {
  const composeBox = findComposeBox(platform);
  const submitButton = findSubmitButton(platform);

  return {
    canSubmit: Boolean(submitButton && !isButtonDisabled(submitButton)),
    composeBoxAvailable: Boolean(composeBox),
    submitButtonAvailable: Boolean(submitButton),
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

export function publishComposer(
  platform: PlatformConfig | null,
): ComposerActionResult {
  const submitButton = findSubmitButton(platform);

  if (!submitButton) {
    return {
      error: 'Publish button not found on the active page.',
      success: false,
    };
  }

  if (isButtonDisabled(submitButton)) {
    return {
      error: 'Publish button is currently disabled.',
      success: false,
    };
  }

  submitButton.dispatchEvent(
    new MouseEvent('click', {
      bubbles: true,
      cancelable: true,
      composed: true,
    }),
  );

  if (typeof (submitButton as HTMLButtonElement).click === 'function') {
    (submitButton as HTMLButtonElement).click();
  }

  return { success: true };
}

export function insertAndPublishContent(
  content: string,
  platform: PlatformConfig | null,
): ComposerActionResult {
  const insertResult = insertContentIntoComposer(content, platform);

  if (!insertResult.success) {
    return insertResult;
  }

  return publishComposer(platform);
}
