import type {
  ImportedSourceResponse,
  RawSourceCapture,
  SourceSaveResult,
} from '~models/imported-source.model';
import type { PlatformConfig } from '~platforms/config';
import {
  isStaleExtensionError,
  STALE_EXTENSION_MESSAGE,
} from '~platforms/extension-context';
import { extractSourceCapture } from '~platforms/source-capture-extract';
import { createIconButton } from '~platforms/ui/icon-button';
import { icons } from '~platforms/ui/icons';
import { showToast } from '~platforms/ui/toast';
import type { MenuItemSpec } from '~types/genfeed-menu';
import { logger } from '~utils/logger.util';

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
      message: isStaleExtensionError(error)
        ? STALE_EXTENSION_MESSAGE
        : error instanceof Error && error.message
          ? error.message
          : 'Could not save this source.',
    };
  }
}

function createSourceButton(): HTMLElement {
  const { button, host, setIcon } = createIconButton({
    icon: icons.bookmark,
    label: SOURCE_BUTTON_LABEL,
  });
  button.addEventListener('click', async (event) => {
    event.stopPropagation();
    setIcon(icons.spinner, true);
    button.disabled = true;
    const outcome = await savePageSource();
    setIcon(outcome.isError ? icons.x : icons.check);
    button.title = outcome.message;
    showToast(outcome.message, outcome.isError);
    window.setTimeout(() => {
      setIcon(icons.bookmark);
      button.title = SOURCE_BUTTON_LABEL;
      button.disabled = false;
    }, RESET_DELAY_MS);
  });
  return host;
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

/** The "save source" row of the Genfeed menu, on the networks and pages that can be saved. */
export function createSourceMenuItem(
  platform: PlatformConfig | null,
): MenuItemSpec | null {
  if (!platform || !SUPPORTED_PLATFORMS.includes(platform.platform)) {
    return null;
  }
  return {
    icon: icons.bookmark,
    id: 'save-source',
    isAvailable: isSourcePage,
    label: SOURCE_BUTTON_LABEL,
    run: async (controls) => {
      controls.setStatus('busy', 'Saving...');
      const outcome = await savePageSource();
      controls.setStatus(outcome.isError ? 'error' : 'done', outcome.message);
    },
  };
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
      showToast('Image copied.');
    } catch {
      showToast(
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
      showToast('Open this post to save its image as a source.', true);
      return;
    }
    save.disabled = true;
    try {
      const outcome = describeSaveOutcome(await sendSave(raw));
      showToast(outcome.message, outcome.isError);
    } catch {
      showToast('Could not save this source.', true);
    } finally {
      save.disabled = false;
    }
  });
  return [copy, save];
}
