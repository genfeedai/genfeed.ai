import type {
  ImportedSourceResponse,
  RawSourceCapture,
  SourceSaveResult,
} from '~models/imported-source.model';
import type { PlatformConfig } from '~platforms/config';
import { extractSourceCapture } from '~platforms/source-capture-extract';
import { icons } from '~platforms/ui-helpers';
import { logger } from '~utils/logger.util';

const TOAST_DURATION_MS = 3600;
const RESET_DELAY_MS = 3000;
const SOURCE_BUTTON_LABEL = 'Save source for later';
const SUPPORTED_PLATFORMS: readonly string[] = ['twitter', 'reddit', 'youtube'];

function isSafePostId(postId: string): boolean {
  return /^[\w:-]+$/.test(postId);
}

/** X post, Reddit post or YouTube video that is open on its own page. */
export function isSourcePage(
  location: Pick<
    Location,
    'hostname' | 'pathname' | 'search'
  > = window.location,
): boolean {
  const host = location.hostname.replace(/^www\./, '');
  if (/(^|\.)(x|twitter)\.com$/.test(host)) {
    return /^\/[^/]+\/status\/\d+/.test(location.pathname);
  }
  if (/(^|\.)reddit\.com$/.test(host)) {
    return /\/comments\/[a-z0-9]+/i.test(location.pathname);
  }
  if (/(^|\.)youtube\.com$/.test(host)) {
    return (
      (location.pathname === '/watch' &&
        new URLSearchParams(location.search).has('v')) ||
      /^\/shorts\/[\w-]{6,}/.test(location.pathname)
    );
  }
  return false;
}

export function describeSaveOutcome(
  response: ImportedSourceResponse<SourceSaveResult> | undefined,
): { isError: boolean; message: string } {
  if (response?.success && response.data) {
    return {
      isError: false,
      message: response.data.deduplicated
        ? 'Already saved. Nothing was changed or generated.'
        : 'Saved for later. Nothing was generated.',
    };
  }
  if (response?.code === 'IMPORTED_SOURCE_DELETED') {
    return {
      isError: true,
      message: 'Deleted earlier. Open the Genfeed panel to save it again.',
    };
  }
  return {
    isError: true,
    message: response?.error || 'Could not save this source.',
  };
}

async function sendSave(
  raw: RawSourceCapture,
): Promise<ImportedSourceResponse<SourceSaveResult> | undefined> {
  return (await chrome.runtime.sendMessage({
    event: 'importedSourceSave',
    raw,
  })) as ImportedSourceResponse<SourceSaveResult> | undefined;
}

/** Saves the post or video open on this page. The page text never leaves the browser unsaved. */
export async function savePageSource(): Promise<{
  isError: boolean;
  message: string;
}> {
  try {
    return describeSaveOutcome(
      await sendSave(extractSourceCapture({ scope: 'page' })),
    );
  } catch (error) {
    logger.error('Source capture failed', error);
    return {
      isError: true,
      message:
        error instanceof Error && error.message
          ? error.message
          : 'Could not save this source.',
    };
  }
}

export function showSourceToast(message: string, isError = false): void {
  document.querySelector('.genfeed-toast')?.remove();
  const toast = document.createElement('div');
  toast.className = `genfeed-toast${isError ? ' genfeed-toast-error' : ''}`;
  toast.textContent = message;
  document.body.appendChild(toast);
  window.setTimeout(() => toast.remove(), TOAST_DURATION_MS);
}

function createSourceButton(): HTMLButtonElement {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'genfeed-btn genfeed-save-btn';
  button.title = SOURCE_BUTTON_LABEL;
  button.setAttribute('aria-label', SOURCE_BUTTON_LABEL);
  button.innerHTML = icons.bookmark;
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    const original = button.innerHTML;
    button.innerHTML = icons.spinner;
    button.disabled = true;
    const outcome = await savePageSource();
    button.innerHTML = outcome.isError ? icons.x : icons.check;
    button.title = outcome.message;
    showSourceToast(outcome.message, outcome.isError);
    window.setTimeout(() => {
      button.innerHTML = original;
      button.title = SOURCE_BUTTON_LABEL;
      button.disabled = false;
    }, RESET_DELAY_MS);
  });
  return button;
}

/** A visible "save source" action on the post or video the user is viewing. */
export function attachSourceButton(platform: PlatformConfig): void {
  if (!SUPPORTED_PLATFORMS.includes(platform.platform) || !isSourcePage()) {
    return;
  }
  const postId = platform.extractPostId();
  if (!postId || !isSafePostId(postId)) {
    return;
  }
  if (document.querySelector('[data-genfeed-source]')) {
    return;
  }
  const actions = platform.selectors.actionsContainer
    ? document.querySelector(platform.selectors.actionsContainer)
    : null;
  if (!actions) {
    return;
  }
  const button = createSourceButton();
  button.dataset.genfeedSource = postId;
  actions.appendChild(button);
}

interface SourceMenuOptions {
  dropdown: HTMLElement;
  platform: PlatformConfig;
}

/** First item of the Genfeed menu next to the composer. */
export function attachSourceMenuItem({
  dropdown,
  platform,
}: SourceMenuOptions): void {
  if (!SUPPORTED_PLATFORMS.includes(platform.platform) || !isSourcePage()) {
    return;
  }
  const menu = dropdown.querySelector('.genfeed-dropdown-menu');
  if (!menu || menu.querySelector('[data-genfeed-source-menu]')) {
    return;
  }
  const item = document.createElement('button');
  item.type = 'button';
  item.className = 'genfeed-menu-item';
  item.dataset.genfeedSourceMenu = 'true';
  item.textContent = SOURCE_BUTTON_LABEL;
  item.addEventListener('click', async (event) => {
    event.stopPropagation();
    menu.classList.remove('active');
    item.disabled = true;
    item.textContent = 'Saving…';
    const outcome = await savePageSource();
    item.textContent = outcome.message;
    item.disabled = false;
    window.setTimeout(() => {
      item.textContent = SOURCE_BUTTON_LABEL;
    }, RESET_DELAY_MS);
  });
  menu.prepend(item);
}

async function toPngBlob(blob: Blob): Promise<Blob> {
  if (blob.type === 'image/png') {
    return blob;
  }
  const bitmap = await createImageBitmap(blob);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const context = canvas.getContext('2d');
  if (!context) {
    throw new Error('Canvas is unavailable.');
  }
  context.drawImage(bitmap, 0, 0);
  bitmap.close();
  return await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) => (result ? resolve(result) : reject(new Error('No image'))),
      'image/png',
    );
  });
}

/** Copies the image bytes to the clipboard. It saves nothing and generates nothing. */
export async function copyImageToClipboard(url: string): Promise<void> {
  const response = await fetch(url, { credentials: 'omit' });
  if (!response.ok) {
    throw new Error('The image could not be read.');
  }
  const png = await toPngBlob(await response.blob());
  await navigator.clipboard.write([new ClipboardItem({ 'image/png': png })]);
}

/** The post an image sits in, from the feed or a status page. */
export function captureXPostImage(
  image: HTMLImageElement,
): RawSourceCapture | null {
  const article = image.closest<HTMLElement>('article[data-testid="tweet"]');
  const link = article
    ?.querySelector<HTMLAnchorElement>('a[href*="/status/"] time')
    ?.closest('a');
  const match = link?.href.match(
    /^https?:\/\/(?:www\.)?(?:x|twitter)\.com\/([^/]+)\/status\/(\d+)/,
  );
  const url = image.currentSrc || image.src;
  if (!article || !match || !/^https:/.test(url)) {
    return null;
  }
  const [, handle, tweetId] = match;
  const permalink = `https://x.com/${handle}/status/${tweetId}`;
  const text =
    article
      .querySelector('[data-testid="tweetText"]')
      ?.textContent?.replace(/\s+/g, ' ')
      .trim() ?? '';
  const author =
    article.querySelector('[data-testid="User-Name"] a')?.textContent?.trim() ||
    undefined;
  return {
    author,
    authorHandle: handle,
    canonicalUrl: permalink,
    externalIdentity: tweetId,
    host: 'x',
    isSelection: false,
    media: [
      {
        kind: 'image',
        label: image.alt.trim() || 'Post image',
        origin: 'selected',
        url,
      },
    ],
    scope: 'media',
    text,
    title: text ? text.slice(0, 120) : `Post by ${author ?? handle}`,
    typeHints: [],
    url: permalink,
  };
}

/** Image actions in the X image overlay. Both are explicit clicks and neither generates. */
export function createImageSourceActions(
  image: HTMLImageElement,
): HTMLButtonElement[] {
  const copy = document.createElement('button');
  copy.type = 'button';
  copy.className = 'genfeed-image-action';
  copy.textContent = 'Copy image';
  copy.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    copy.disabled = true;
    try {
      await copyImageToClipboard(image.currentSrc || image.src);
      showSourceToast('Image copied.');
    } catch {
      showSourceToast(
        'This site does not allow copying this image. Use the browser menu instead.',
        true,
      );
    } finally {
      copy.disabled = false;
    }
  });

  const save = document.createElement('button');
  save.type = 'button';
  save.className = 'genfeed-image-action';
  save.textContent = 'Save as source';
  save.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopPropagation();
    const raw = captureXPostImage(image);
    if (!raw) {
      showSourceToast('Open this post to save its image as a source.', true);
      return;
    }
    save.disabled = true;
    try {
      const outcome = describeSaveOutcome(await sendSave(raw));
      showSourceToast(outcome.message, outcome.isError);
    } catch {
      showSourceToast('Could not save this source.', true);
    } finally {
      save.disabled = false;
    }
  });
  return [copy, save];
}
