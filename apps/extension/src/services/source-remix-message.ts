import {
  createSourceRemix,
  executeSourceRemix,
  getSourceRemix,
  listSourceRemixImageModels,
  openSourceRemix,
  quoteSourceRemix,
  resolveSourceRemixStudioUrl,
  reviseSourceRemix,
  SourceRemixError,
} from '~services/source-remix.service';
import { requireWorkspace } from '~services/workspace.service';
import { logger } from '~utils/logger.util';

type SendResponse = (response?: Record<string, unknown>) => void;

export const SOURCE_REMIX_EVENTS: ReadonlySet<string> = new Set([
  'sourceRemixCreate',
  'sourceRemixExecute',
  'sourceRemixGet',
  'sourceRemixModels',
  'sourceRemixOpen',
  'sourceRemixQuote',
  'sourceRemixRevise',
  'sourceRemixStudioUrl',
]);

interface SourceRemixRequest {
  brandId?: unknown;
  edits?: unknown;
  event?: string;
  expectedRevision?: unknown;
  model?: unknown;
  quoteId?: unknown;
  runId?: unknown;
  sourceId?: unknown;
}

const SELECT_BRAND_MESSAGE = 'Select a brand before remixing a source.';

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function revision(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new SourceRemixError('Reload this remix, then try again.');
  }
  return value;
}

async function brandOf(value: unknown): Promise<string> {
  const requested = text(value);
  if (requested) return requested;
  const brandId = (await requireWorkspace()).brandId ?? '';
  if (!brandId) throw new SourceRemixError(SELECT_BRAND_MESSAGE);
  return brandId;
}

async function run(
  request: SourceRemixRequest,
  sendResponse: SendResponse,
): Promise<void> {
  const runId = text(request.runId);
  switch (request.event) {
    case 'sourceRemixOpen':
      sendResponse({
        data: await openSourceRemix(
          await brandOf(request.brandId),
          text(request.sourceId),
        ),
        success: true,
      });
      return;
    case 'sourceRemixCreate':
      sendResponse({
        data: await createSourceRemix(
          await brandOf(request.brandId),
          text(request.sourceId),
        ),
        success: true,
      });
      return;
    case 'sourceRemixGet':
      sendResponse({ data: await getSourceRemix(runId), success: true });
      return;
    case 'sourceRemixRevise':
      sendResponse({
        data: await reviseSourceRemix(
          runId,
          revision(request.expectedRevision),
          request.edits as Parameters<typeof reviseSourceRemix>[2],
        ),
        success: true,
      });
      return;
    case 'sourceRemixQuote':
      sendResponse({
        data: await quoteSourceRemix(
          runId,
          revision(request.expectedRevision),
          text(request.model) || undefined,
        ),
        success: true,
      });
      return;
    case 'sourceRemixExecute':
      sendResponse({
        data: await executeSourceRemix(
          runId,
          revision(request.expectedRevision),
          text(request.quoteId),
        ),
        success: true,
      });
      return;
    case 'sourceRemixModels':
      sendResponse({
        data: await listSourceRemixImageModels(),
        success: true,
      });
      return;
    case 'sourceRemixStudioUrl':
      sendResponse({
        data: await resolveSourceRemixStudioUrl(runId),
        success: true,
      });
      return;
    default:
      sendResponse({ error: 'Unsupported remix action.', success: false });
  }
}

/** Explicit remix actions from the panel. Only `sourceRemixExecute` can spend credits. */
export function handleSourceRemixMessage(
  request: SourceRemixRequest,
  sendResponse: SendResponse,
): void {
  void run(request, sendResponse).catch((error: unknown) => {
    if (!(error instanceof SourceRemixError)) {
      logger.error('Source remix action failed', error);
    }
    sendResponse({
      error:
        error instanceof Error && error.message
          ? error.message
          : 'Could not complete this remix action.',
      success: false,
    });
  });
}
