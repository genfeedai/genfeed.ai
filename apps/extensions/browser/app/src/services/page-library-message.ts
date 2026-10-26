import type { AgentArtifactReference } from '@genfeedai/contracts/interfaces';
import {
  loadLibraryAssets,
  resolveLibraryAssetDelivery,
} from '~services/library.service';
import { handoffLibraryAsset } from '~services/library-handoff.service';
import { requireWorkspace } from '~services/workspace.service';
import type { PageLibraryItem } from '~types/extension';
import { logger } from '~utils/logger.util';

type SendResponse = (response?: Record<string, unknown>) => void;
type FetchDataUrl = (
  url: string,
  token?: string,
  maxSizeBytes?: number,
) => Promise<string | null>;

/** Library requests from the page menu, answered by the background. */
export const PAGE_LIBRARY_EVENTS: ReadonlySet<string> = new Set([
  'pageLibraryList',
  'pageLibraryFile',
  'pageLibraryOpen',
]);

const PAGE_LIBRARY_LIMIT = 12;
const THUMBNAIL_MAX_BYTES = 2 * 1024 * 1024;
const FILE_MAX_BYTES = 50 * 1024 * 1024;

const FILE_EXTENSIONS: Record<string, string> = {
  'image/gif': 'gif',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/quicktime': 'mp4',
  'video/webm': 'mp4',
};

interface PageLibraryRequest {
  event?: string;
  reference?: unknown;
}

function isReference(value: unknown): value is AgentArtifactReference {
  const reference = value as Partial<AgentArtifactReference> | null;
  return (
    typeof reference?.recordId === 'string' &&
    typeof reference.brandId === 'string' &&
    typeof reference.organizationId === 'string'
  );
}

async function listMedia(
  fetchDataUrl: FetchDataUrl,
): Promise<PageLibraryItem[]> {
  const { brandId } = await requireWorkspace();
  if (!brandId) {
    throw new Error('Select a brand in Genfeed to use its Library.');
  }
  const { items } = await loadLibraryAssets(brandId);
  const media = items
    .filter((item) => item.kind === 'image' || item.kind === 'video')
    .slice(0, PAGE_LIBRARY_LIMIT);
  return Promise.all(
    media.map(async (item) => ({
      id: item.id,
      kind: item.kind as PageLibraryItem['kind'],
      reference: item.reference,
      thumbnail: item.thumbnailUrl
        ? ((await fetchDataUrl(
            item.thumbnailUrl,
            undefined,
            THUMBNAIL_MAX_BYTES,
          )) ?? undefined)
        : undefined,
      title: item.contentTitle,
    })),
  );
}

async function loadFile(
  reference: AgentArtifactReference,
  fetchDataUrl: FetchDataUrl,
): Promise<{ dataUrl: string; filename: string }> {
  const { url } = await resolveLibraryAssetDelivery(reference);
  const dataUrl = await fetchDataUrl(url, undefined, FILE_MAX_BYTES);
  if (!dataUrl) {
    throw new Error('Could not download this asset. Open it instead.');
  }
  const mime = dataUrl.slice(5, dataUrl.indexOf(';'));
  return {
    dataUrl,
    filename: `genfeed-library.${FILE_EXTENSIONS[mime] ?? 'png'}`,
  };
}

async function run(
  request: PageLibraryRequest,
  fetchDataUrl: FetchDataUrl,
): Promise<Record<string, unknown>> {
  if (request.event === 'pageLibraryList') {
    return { items: await listMedia(fetchDataUrl), success: true };
  }
  if (!isReference(request.reference)) {
    throw new Error('This asset is unavailable. Pick it again.');
  }
  if (request.event === 'pageLibraryFile') {
    return {
      ...(await loadFile(request.reference, fetchDataUrl)),
      success: true,
    };
  }
  await handoffLibraryAsset(request.reference, 'open');
  return { success: true };
}

/**
 * Lists the active brand's Library media for the page picker, hands one asset
 * to the page as a file, or opens it in a tab when the page cannot take it.
 */
export function handlePageLibraryMessage(
  request: PageLibraryRequest,
  sendResponse: SendResponse,
  fetchDataUrl: FetchDataUrl,
): void {
  void run(request, fetchDataUrl)
    .then(sendResponse)
    .catch((error: unknown) => {
      logger.error('Page Library action failed', error);
      sendResponse({
        error:
          error instanceof Error && error.message
            ? error.message
            : 'Could not reach your Library.',
        success: false,
      });
    });
}
