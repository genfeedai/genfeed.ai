import type { PlatformConfig } from '~platforms/config';
import { findElement } from '~platforms/twitter-selectors';
import type {
  AppliedComposerText,
  ComposerTextSnapshot,
} from '~types/extension';

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

/**
 * Opens a collapsed reply box (YouTube, Reddit) so there is something to type
 * into. Returns whether a composer is on the page afterwards; it never submits.
 */
export async function activateComposer(
  platform: PlatformConfig | null,
  waitMs = 800,
): Promise<boolean> {
  if (findComposeBox(platform)) return true;
  const selector = platform?.selectors.replyActivator;
  const activator = selector
    ? document.querySelector<HTMLElement>(selector)
    : null;
  if (!activator) return false;
  activator.click();
  const deadline = Date.now() + waitMs;
  while (Date.now() < deadline) {
    if (findComposeBox(platform)) return true;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  return findComposeBox(platform) !== null;
}

/**
 * Puts `content` in the page's reply box as the user would type it. Nothing is
 * submitted: the user reads it and posts it themselves.
 */
export function insertContentIntoComposer(
  content: string,
  platform: PlatformConfig | null,
): ComposerActionResult {
  const composeBox = findComposeBox(platform);
  const editable = composeBox ? resolveEditable(composeBox) : null;

  if (!editable) {
    return {
      error: composeBox
        ? 'Unsupported composer element type.'
        : 'Compose box not found on the active page. Click Reply on the post first, or copy the text.',
      success: false,
    };
  }

  replaceWholeDraft(editable, content);
  return collapseWhitespace(readDraft(editable)).includes(
    collapseWhitespace(content),
  )
    ? { success: true }
    : { error: EDIT_NOT_ACCEPTED, success: false };
}

// === Reading and replacing the user's own draft (text actions) ===

const EDITABLE_SELECTOR =
  '[contenteditable="true"], [contenteditable="plaintext-only"]';

function isFormField(
  element: HTMLElement,
): element is HTMLTextAreaElement | HTMLInputElement {
  return (
    element instanceof HTMLTextAreaElement ||
    element instanceof HTMLInputElement
  );
}

function resolveEditable(box: HTMLElement): HTMLElement | null {
  if (isFormField(box)) return box;
  const attribute = box.getAttribute('contenteditable');
  if (
    box.isContentEditable ||
    attribute === 'true' ||
    attribute === 'plaintext-only'
  )
    return box;
  return box.querySelector<HTMLElement>(EDITABLE_SELECTOR);
}

/** The composer the user is working in: the focused one, else the first that holds text. */
function findActiveComposer(
  platform: PlatformConfig | null,
): HTMLElement | null {
  const selector = platform?.selectors.replyTextarea;
  if (!selector) return null;
  const candidates = Array.from(
    document.querySelectorAll<HTMLElement>(selector),
  )
    .map(resolveEditable)
    .filter((element): element is HTMLElement => element !== null);
  if (candidates.length === 0) {
    const fallback = isTwitterHost(window.location.hostname)
      ? findElement('replyTextarea')
      : null;
    return fallback ? resolveEditable(fallback) : null;
  }
  const active = document.activeElement;
  return (
    candidates.find((element) => active && element.contains(active)) ??
    candidates.find((element) => readDraft(element).trim().length > 0) ??
    candidates[0]
  );
}

function readDraft(element: HTMLElement): string {
  const raw = isFormField(element)
    ? element.value
    : (element.innerText ?? element.textContent ?? '');
  return raw.replace(/\u00a0/g, ' ').replace(/\n+$/u, '');
}

function collapseWhitespace(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

function setNativeValue(
  element: HTMLTextAreaElement | HTMLInputElement,
  value: string,
): void {
  const prototype =
    element instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(prototype, 'value')?.set;
  if (setter) setter.call(element, value);
  else element.value = value;
}

export type ComposerTextCapture =
  | { snapshot: ComposerTextSnapshot; success: true }
  | { error: string; success: false };

/** Reads the selected text of the active composer, or its whole draft when nothing is selected. */
export function captureComposerText(
  platform: PlatformConfig | null,
): ComposerTextCapture {
  const element = findActiveComposer(platform);
  if (!element) {
    return {
      error: 'Open the composer you want to edit first.',
      success: false,
    };
  }
  const draft = readDraft(element);
  let snapshot: ComposerTextSnapshot = {
    draft,
    element,
    scope: 'draft',
    text: draft,
  };
  if (isFormField(element)) {
    const start = element.selectionStart ?? 0;
    const end = element.selectionEnd ?? 0;
    if (end > start) {
      snapshot = {
        draft,
        element,
        scope: 'selection',
        selection: { end, start },
        text: element.value.slice(start, end),
      };
    }
  } else {
    const selection = window.getSelection();
    if (
      selection &&
      !selection.isCollapsed &&
      selection.rangeCount > 0 &&
      selection.anchorNode &&
      selection.focusNode &&
      element.contains(selection.anchorNode) &&
      element.contains(selection.focusNode)
    ) {
      snapshot = {
        draft,
        element,
        range: selection.getRangeAt(0).cloneRange(),
        scope: 'selection',
        text: selection.toString(),
      };
    }
  }
  if (!snapshot.text.trim()) {
    return { error: 'Write or select some text first.', success: false };
  }
  return { snapshot, success: true };
}

export type ComposerTextWrite =
  | { applied: AppliedComposerText; success: true }
  | { error: string; success: false };

const DRAFT_CHANGED =
  'Your draft changed since the preview. Run the action again.';
const EDIT_NOT_ACCEPTED =
  'The page did not accept the edit. Copy the text instead.';

function writeFormField(
  element: HTMLTextAreaElement | HTMLInputElement,
  value: string,
): void {
  element.focus();
  setNativeValue(element, value);
  dispatchComposerInputEvents(element);
}

function writeEditable(element: HTMLElement, range: Range, text: string): void {
  element.focus();
  const selection = window.getSelection();
  selection?.removeAllRanges();
  selection?.addRange(range);
  const hasExecCommand = typeof document.execCommand === 'function';
  if (!hasExecCommand || !document.execCommand('insertText', false, text)) {
    range.deleteContents();
    range.insertNode(document.createTextNode(text));
  }
  dispatchComposerInputEvents(element);
}

function replaceWholeDraft(element: HTMLElement, text: string): void {
  if (isFormField(element)) {
    writeFormField(element, text);
    return;
  }
  const range = document.createRange();
  range.selectNodeContents(element);
  writeEditable(element, range, text);
}

/**
 * Replaces the captured selection (or the whole draft) with `text`. Nothing is
 * written unless the draft is exactly as it was captured, so an edit the user
 * made after the preview is never overwritten.
 */
export function applyComposerText(
  snapshot: ComposerTextSnapshot,
  text: string,
): ComposerTextWrite {
  const { draft, element } = snapshot;
  if (!element.isConnected) {
    return { error: 'The composer is no longer on the page.', success: false };
  }
  if (readDraft(element) !== draft) {
    return { error: DRAFT_CHANGED, success: false };
  }
  if (snapshot.scope === 'draft') {
    replaceWholeDraft(element, text);
  } else if (isFormField(element) && snapshot.selection) {
    const { end, start } = snapshot.selection;
    writeFormField(element, draft.slice(0, start) + text + draft.slice(end));
  } else if (snapshot.range) {
    writeEditable(element, snapshot.range, text);
  } else {
    return { error: DRAFT_CHANGED, success: false };
  }
  const draftAfter = readDraft(element);
  if (!collapseWhitespace(draftAfter).includes(collapseWhitespace(text))) {
    return { error: EDIT_NOT_ACCEPTED, success: false };
  }
  return {
    applied: { draftAfter, draftBefore: draft, element },
    success: true,
  };
}

/** Puts the draft back as it was before an apply, unless it changed since. */
export function undoComposerText(
  applied: AppliedComposerText,
): ComposerActionResult {
  const { draftAfter, draftBefore, element } = applied;
  if (!element.isConnected) {
    return { error: 'The composer is no longer on the page.', success: false };
  }
  if (readDraft(element) !== draftAfter) {
    return {
      error: 'Your draft changed after Apply, so Undo would overwrite it.',
      success: false,
    };
  }
  replaceWholeDraft(element, draftBefore);
  return collapseWhitespace(readDraft(element)) ===
    collapseWhitespace(draftBefore)
    ? { success: true }
    : { error: EDIT_NOT_ACCEPTED, success: false };
}
