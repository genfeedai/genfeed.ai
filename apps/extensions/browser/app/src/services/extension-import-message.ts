import { parseSocialPostUrl } from '@genfeedai/contracts';

import { IMPORTED_POSTS_CHANGED } from '~models/imported-source-post.model';
import { getCaptureBrand } from '~services/knowledge-capture.service';
import {
  importSocialPost,
  listImportedSourcePosts,
  resolveImportedRemixUrl,
  SocialPostImportError,
  UNSUPPORTED_POST_URL_MESSAGE,
} from '~services/social-post-import.service';
import type { ExtensionMessage } from '~types/extension';
import { sanitizeCaptureUrl } from '~utils/knowledge-snapshot.util';
import { logger } from '~utils/logger.util';

type SendResponse = (response?: Record<string, unknown>) => void;

interface ExtensionImportRequest {
  brandId?: unknown;
  event?: string;
  platform?: unknown;
  postId?: unknown;
  url?: unknown;
}

const SELECT_BRAND_MESSAGE =
  'Select a brand in the Genfeed panel before importing this post.';

function readUrl(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function resolveBrandId(value: unknown): Promise<string> {
  if (typeof value === 'string' && value.trim()) {
    return value.trim();
  }
  try {
    return (await getCaptureBrand()) ?? '';
  } catch {
    return '';
  }
}

async function openImportedReview(url: string): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id) {
    return;
  }
  await chrome.sidePanel.open({ tabId: tab.id });
  const payload: ExtensionMessage = {
    captureMode: 'social',
    content: '',
    type: 'IDEA',
    url,
  };
  await Promise.resolve(
    chrome.runtime.sendMessage({ payload, type: 'OPEN_MODE' }),
  ).catch(() => undefined);
  await Promise.resolve(
    chrome.runtime.sendMessage({ type: IMPORTED_POSTS_CHANGED }),
  ).catch(() => undefined);
}

function errorMessage(error: unknown, fallback: string): string {
  if (error instanceof SocialPostImportError) {
    return error.message;
  }
  return error instanceof Error && error.message ? error.message : fallback;
}

async function runExtensionImportMessage(
  request: ExtensionImportRequest,
  sendResponse: SendResponse,
): Promise<void> {
  const brandId = await resolveBrandId(request.brandId);
  if (request.event === 'openImportedRemix') {
    if (!brandId) {
      sendResponse({ error: SELECT_BRAND_MESSAGE, success: false });
      return;
    }
    const url = await resolveImportedRemixUrl({
      brandId,
      platform: readUrl(request.platform),
      sourcePostId: readUrl(request.postId),
    });
    await Promise.resolve(chrome.tabs.create({ url }));
    sendResponse({ success: true, url });
    return;
  }
  if (request.event === 'listImportedPosts') {
    if (!brandId) {
      sendResponse({ error: SELECT_BRAND_MESSAGE, success: false });
      return;
    }
    const posts = await listImportedSourcePosts(brandId);
    sendResponse({ data: posts, success: true });
    return;
  }

  const rawUrl = readUrl(request.url);
  if (!rawUrl) {
    sendResponse({ error: 'Enter a post URL to import.', success: false });
    return;
  }
  const url = sanitizeCaptureUrl(rawUrl);
  if (!parseSocialPostUrl(url)) {
    sendResponse({ error: UNSUPPORTED_POST_URL_MESSAGE, success: false });
    return;
  }
  if (!brandId) {
    await openImportedReview(url).catch(() => undefined);
    sendResponse({ error: SELECT_BRAND_MESSAGE, success: false });
    return;
  }
  const outcome = await importSocialPost({ brandId, url });
  await openImportedReview(url).catch((error: unknown) => {
    logger.error('Could not open Imported review', error);
  });
  sendResponse({
    deduplicated: outcome.deduplicated,
    post: outcome.post,
    success: true,
  });
}

/** Confirmed post import. Does not write Knowledge or generate. */
export function handleExtensionImportMessage(
  request: ExtensionImportRequest,
  sendResponse: SendResponse,
): void {
  void runExtensionImportMessage(request, sendResponse).catch(
    (error: unknown) => {
      logger.error('Social post import failed', error);
      sendResponse({
        error: errorMessage(error, 'Could not import this post.'),
        success: false,
      });
    },
  );
}
