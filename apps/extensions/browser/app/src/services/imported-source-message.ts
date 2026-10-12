import {
  IMPORTED_SOURCES_CHANGED,
  type ImportedSourceMediaKind,
  type RawSourceCapture,
  type SourceCaptureRequest,
  type SourceSaveRequest,
} from '~models/imported-source.model';
import { extractSourceCapture } from '~platforms/source-capture-extract';
import {
  buildSourceSnapshot,
  isRawSourceCapture,
  SourceCaptureError,
} from '~platforms/source-capture-snapshot';
import {
  ImportedSourceError,
  listImportedSources,
  observeSourceMedia,
  recaptureImportedSource,
  retrySourceMedia,
  saveImportedSource,
  startSourceMedia,
} from '~services/imported-source.service';
import { requireWorkspace } from '~services/workspace.service';
import type { ExtensionMessage } from '~types/extension';
import { sanitizeCaptureUrl } from '~utils/knowledge-snapshot.util';
import { logger } from '~utils/logger.util';

type SendResponse = (response?: Record<string, unknown>) => void;
type MessageSender = { tab?: { id?: number } };

export const IMPORTED_SOURCE_EVENTS: ReadonlySet<string> = new Set([
  'importedSourceCapture',
  'importedSourceList',
  'importedSourceMediaObserve',
  'importedSourceMediaRetry',
  'importedSourceMediaStart',
  'importedSourceRecapture',
  'importedSourceSave',
]);

interface ImportedSourceRequest {
  brandId?: unknown;
  capture?: unknown;
  event?: string;
  expectedIngestRevision?: unknown;
  kind?: unknown;
  mediaIndex?: unknown;
  raw?: unknown;
  sourceId?: unknown;
}

const SELECT_BRAND_MESSAGE =
  'Select a brand in the Genfeed panel before saving this source.';
const CAPTURE_SCOPES: readonly string[] = [
  'page',
  'selection',
  'link',
  'media',
];
const MEDIA_KINDS: readonly string[] = ['image', 'video', 'audio'];

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

async function resolveBrandId(value: unknown): Promise<string> {
  const requested = text(value);
  if (requested) return requested;
  try {
    return (await requireWorkspace()).brandId ?? '';
  } catch {
    return '';
  }
}

function readCaptureRequest(value: unknown): SourceCaptureRequest {
  const request =
    value !== null && typeof value === 'object'
      ? (value as Record<string, unknown>)
      : {};
  const scope = text(request.scope);
  if (!CAPTURE_SCOPES.includes(scope)) {
    return { scope: 'page' };
  }
  const mediaKind = text(request.mediaKind);
  return {
    scope: scope as SourceCaptureRequest['scope'],
    ...(mediaKind && MEDIA_KINDS.includes(mediaKind)
      ? { mediaKind: mediaKind as ImportedSourceMediaKind }
      : {}),
    ...(text(request.targetUrl) ? { targetUrl: text(request.targetUrl) } : {}),
  };
}

/** Captures what the user sees in the active tab. It never fetches media. */
export async function captureActiveTab(
  request: SourceCaptureRequest,
  expectedUrl?: string,
): Promise<RawSourceCapture> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab?.id || !tab.url) {
    throw new SourceCaptureError('Open a page before saving a source.');
  }
  const tabUrl = sanitizeCaptureUrl(tab.url);
  if (expectedUrl && sanitizeCaptureUrl(expectedUrl) !== tabUrl) {
    throw new SourceCaptureError(
      'The active page changed. Return to the source page, then capture it again.',
    );
  }
  if (request.scope === 'link') {
    if (!request.targetUrl) {
      throw new SourceCaptureError('Choose a link to save.');
    }
    const target = sanitizeCaptureUrl(request.targetUrl);
    return {
      isSelection: false,
      media: [],
      scope: 'link',
      text: '',
      title: new URL(target).hostname,
      typeHints: [],
      url: target,
    };
  }
  const results = await chrome.scripting.executeScript({
    args: [request],
    func: extractSourceCapture,
    target: { tabId: tab.id },
  });
  const raw: unknown = results[0]?.result;
  if (!isRawSourceCapture(raw)) {
    throw new SourceCaptureError(
      'This page does not allow capture. Save its link instead.',
    );
  }
  return raw;
}

async function openSourcesPanel(tabId: number | undefined): Promise<void> {
  if (tabId === undefined) return;
  const payload: ExtensionMessage = {
    content: '',
    type: 'SOURCE',
    url: '',
  };
  await chrome.sidePanel.open({ tabId });
  await Promise.resolve(
    chrome.runtime.sendMessage({ payload, type: 'OPEN_MODE' }),
  ).catch(() => undefined);
}

function notifyChanged(): void {
  void Promise.resolve(
    chrome.runtime.sendMessage({ type: IMPORTED_SOURCES_CHANGED }),
  ).catch(() => undefined);
}

function readSaveRequest(request: ImportedSourceRequest): SourceSaveRequest {
  if (!isRawSourceCapture(request.raw)) {
    throw new SourceCaptureError('Capture a page before saving it.');
  }
  const mediaIndex =
    typeof request.mediaIndex === 'number' &&
    Number.isInteger(request.mediaIndex)
      ? request.mediaIndex
      : request.mediaIndex === null
        ? null
        : undefined;
  return {
    ...(typeof request.kind === 'string'
      ? { kind: request.kind as SourceSaveRequest['kind'] }
      : {}),
    ...(mediaIndex === undefined ? {} : { mediaIndex }),
    raw: request.raw,
  };
}

async function run(
  request: ImportedSourceRequest,
  sender: MessageSender,
  sendResponse: SendResponse,
): Promise<void> {
  const sourceId = text(request.sourceId);
  switch (request.event) {
    case 'importedSourceCapture': {
      const capture = readCaptureRequest(request.capture);
      const expectedUrl =
        request.capture !== null && typeof request.capture === 'object'
          ? text((request.capture as Record<string, unknown>).pageUrl)
          : '';
      sendResponse({
        data: await captureActiveTab(capture, expectedUrl || undefined),
        success: true,
      });
      return;
    }
    case 'importedSourceSave': {
      // Open the panel while the click that started this save is still fresh.
      const panel = openSourcesPanel(sender.tab?.id).catch(() => undefined);
      const brandId = await resolveBrandId(request.brandId);
      if (!brandId) {
        await panel;
        sendResponse({ error: SELECT_BRAND_MESSAGE, success: false });
        return;
      }
      const source = await saveImportedSource(
        brandId,
        buildSourceSnapshot(readSaveRequest(request)),
      );
      await panel;
      notifyChanged();
      sendResponse({
        data: { deduplicated: source.deduplicated, source },
        success: true,
      });
      return;
    }
    default:
      break;
  }
  const brandId = await resolveBrandId(request.brandId);
  if (!brandId) {
    sendResponse({ error: SELECT_BRAND_MESSAGE, success: false });
    return;
  }
  switch (request.event) {
    case 'importedSourceList':
      sendResponse({ data: await listImportedSources(brandId), success: true });
      return;
    case 'importedSourceRecapture': {
      const source = await recaptureImportedSource(brandId, sourceId);
      notifyChanged();
      sendResponse({
        data: { deduplicated: source.deduplicated, source },
        success: true,
      });
      return;
    }
    case 'importedSourceMediaStart':
      sendResponse({
        data: await startSourceMedia(brandId, sourceId),
        success: true,
      });
      return;
    case 'importedSourceMediaObserve':
      sendResponse({
        data: await observeSourceMedia(brandId, sourceId),
        success: true,
      });
      return;
    case 'importedSourceMediaRetry': {
      const revision = request.expectedIngestRevision;
      if (typeof revision !== 'number' || !Number.isInteger(revision)) {
        throw new ImportedSourceError('Reload this source, then retry.');
      }
      sendResponse({
        data: await retrySourceMedia(brandId, sourceId, revision),
        success: true,
      });
      return;
    }
    default:
      sendResponse({ error: 'Unsupported source action.', success: false });
  }
}

/** Explicit source actions from the page and the panel. None starts generation. */
export function handleImportedSourceMessage(
  request: ImportedSourceRequest,
  sender: MessageSender,
  sendResponse: SendResponse,
): void {
  void run(request, sender, sendResponse).catch((error: unknown) => {
    if (!(error instanceof SourceCaptureError)) {
      logger.error('Imported source action failed', error);
    }
    sendResponse({
      error:
        error instanceof Error && error.message
          ? error.message
          : 'Could not complete this source action.',
      success: false,
      ...(error instanceof ImportedSourceError && error.code
        ? { code: error.code }
        : {}),
      ...(error instanceof ImportedSourceError && error.deletedSourceId
        ? { deletedSourceId: error.deletedSourceId }
        : {}),
    });
  });
}
