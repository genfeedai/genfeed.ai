import {
  type ImportedSourceSnapshotInput,
  type ImportedSourceView,
  importedSourceViewSchema,
  saveImportedSourceSchema,
} from '@genfeedai/contracts/api-types/contracts/imported-source.contract';
import {
  type ImportedSourceMediaView,
  importedSourceMediaViewSchema,
} from '@genfeedai/contracts/api-types/contracts/imported-source-media.contract';
import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import { isObjectLike } from '@genfeedai/utils/data/extract.util';
import {
  assertWorkspace,
  requireWorkspace,
  scopedWorkspaceRequest,
} from '~services/workspace.service';

const LIST_PAGE_SIZE = 100;
const MAX_LIST_PAGES = 5;
const REQUEST_TIMEOUT_MS = 30_000;

export class ImportedSourceError extends Error {
  readonly code?: string;
  readonly deletedSourceId?: string;

  constructor(message: string, code?: string, deletedSourceId?: string) {
    super(message);
    this.name = 'ImportedSourceError';
    this.code = code;
    this.deletedSourceId = deletedSourceId;
  }
}

const FRIENDLY_MESSAGES: Record<string, string> = {
  IMPORTED_SOURCE_DELETED:
    'This source was deleted earlier. Save it again to restore it.',
  IMPORTED_SOURCE_DUPLICATE_CONFLICT:
    'Genfeed found two copies of this source. Contact support before saving it again.',
  IMPORTED_SOURCE_INPUT_INVALID:
    'Genfeed could not accept what was captured from this page. Select a shorter passage or save the link.',
  IMPORTED_SOURCE_SESSION_REQUIRED:
    'Saving sources needs a signed-in Genfeed session. API-key connections cannot save sources.',
  SOURCE_MEDIA_CHANGED:
    'This source changed. Reload it, then prepare the media again.',
  SOURCE_MEDIA_REQUEST_INVALID: 'Genfeed could not start this media request.',
};

function readMessage(body: unknown, fallback: string): string {
  if (!isObjectLike(body)) return fallback;
  if (typeof body.code === 'string' && FRIENDLY_MESSAGES[body.code]) {
    return FRIENDLY_MESSAGES[body.code];
  }
  const message = body.message;
  if (typeof message === 'string' && message.trim()) return message.trim();
  if (Array.isArray(message)) {
    const first = message.find(
      (item): item is string => typeof item === 'string' && item.trim() !== '',
    );
    if (first) return first.trim();
  }
  return fallback;
}

async function readBody(response: Response): Promise<unknown> {
  try {
    return (await response.json()) as unknown;
  } catch {
    return null;
  }
}

async function scopedBrand(
  brandId: string,
): Promise<ExtensionWorkspaceSnapshot> {
  const workspace = await requireWorkspace();
  if (!brandId.trim()) {
    throw new ImportedSourceError('Select a brand before saving sources.');
  }
  if (workspace.isApiKey) {
    throw new ImportedSourceError(
      FRIENDLY_MESSAGES.IMPORTED_SOURCE_SESSION_REQUIRED,
      'IMPORTED_SOURCE_SESSION_REQUIRED',
    );
  }
  if (brandId !== workspace.brandId) {
    throw new ImportedSourceError(
      'Select the original brand before using this source.',
    );
  }
  return workspace;
}

async function request(
  workspace: ExtensionWorkspaceSnapshot,
  path: string,
  method: 'GET' | 'POST',
  fallback: string,
  body?: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const response = await scopedWorkspaceRequest(
    path,
    {
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      headers: { 'Content-Type': 'application/json' },
      method,
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    },
    workspace,
  );
  const payload = await readBody(response);
  assertWorkspace(workspace);
  if (response.status === 401) {
    throw new ImportedSourceError('Sign in again, then retry.');
  }
  if (!response.ok) {
    const code =
      isObjectLike(payload) && typeof payload.code === 'string'
        ? payload.code
        : undefined;
    throw new ImportedSourceError(
      readMessage(payload, fallback),
      code,
      isObjectLike(payload) && typeof payload.deletedIngredientId === 'string'
        ? payload.deletedIngredientId
        : undefined,
    );
  }
  return payload;
}

function pick(resource: unknown, keys: readonly string[]): unknown {
  if (!isObjectLike(resource)) return null;
  return Object.fromEntries(
    keys.filter((key) => key in resource).map((key) => [key, resource[key]]),
  );
}

const SOURCE_KEYS = [
  'id',
  'brandId',
  'recordVersion',
  'identityDigest',
  'snapshot',
  'recapturedFromIngredientId',
  'deduplicated',
  'createdAt',
  'updatedAt',
] as const;
const MEDIA_KEYS = [
  'id',
  'sourceId',
  'sourceRecordVersion',
  'sourceIdentityDigest',
  'bindingRevision',
  'state',
  'ingestRevision',
  'ingredientId',
  'artifact',
  'mediaKind',
  'errorCode',
  'canRetry',
] as const;

export function parseImportedSource(resource: unknown): ImportedSourceView {
  const parsed = importedSourceViewSchema.safeParse(
    pick(resource, SOURCE_KEYS),
  );
  if (!parsed.success) {
    throw new ImportedSourceError(
      'Genfeed returned a source this extension cannot read. Update the extension.',
    );
  }
  return parsed.data;
}

function parseMedia(resource: unknown): ImportedSourceMediaView {
  const parsed = importedSourceMediaViewSchema.safeParse(
    pick(resource, MEDIA_KEYS),
  );
  if (!parsed.success) {
    throw new ImportedSourceError(
      'Genfeed returned media this extension cannot read. Update the extension.',
    );
  }
  return parsed.data;
}

const brandSegment = encodeURIComponent;
const sourceSegment = encodeURIComponent;

/** Saves one visible snapshot. No generation, no media copy, no Knowledge write. */
export async function saveImportedSource(
  brandId: string,
  snapshot: ImportedSourceSnapshotInput,
): Promise<ImportedSourceView> {
  const workspace = await scopedBrand(brandId);
  const body = saveImportedSourceSchema.parse({ snapshot });
  const payload = await request(
    workspace,
    `/brands/${brandSegment(brandId)}/imported-sources`,
    'POST',
    'Could not save this source.',
    body,
  );
  return parseImportedSource(
    deserializeResource<unknown>(payload as JsonApiResponseDocument),
  );
}

/** An explicit new capture of a source the user deleted. */
export async function recaptureImportedSource(
  brandId: string,
  sourceId: string,
): Promise<ImportedSourceView> {
  const workspace = await scopedBrand(brandId);
  const payload = await request(
    workspace,
    `/brands/${brandSegment(brandId)}/imported-sources/${sourceSegment(sourceId)}/recaptures`,
    'POST',
    'Could not save this source again.',
    { requestId: crypto.randomUUID() },
  );
  return parseImportedSource(
    deserializeResource<unknown>(payload as JsonApiResponseDocument),
  );
}

export async function listImportedSources(
  brandId: string,
  signal?: AbortSignal,
): Promise<ImportedSourceView[]> {
  const workspace = await scopedBrand(brandId);
  const sources: ImportedSourceView[] = [];
  let pages = 1;
  for (let page = 1; page <= Math.min(pages, MAX_LIST_PAGES); page += 1) {
    const payload = await request(
      workspace,
      `/brands/${brandSegment(brandId)}/imported-sources?page=${page}&limit=${LIST_PAGE_SIZE}`,
      'GET',
      'Could not load Imported sources.',
      undefined,
      signal,
    );
    const document = payload as JsonApiResponseDocument;
    pages = document.links?.pagination?.pages ?? 1;
    for (const item of deserializeCollection<unknown>(document)) {
      sources.push(parseImportedSource(item));
    }
  }
  return sources;
}

/** Starts the explicit media copy for the source's selected media. */
export async function startSourceMedia(
  brandId: string,
  sourceId: string,
): Promise<ImportedSourceMediaView> {
  const workspace = await scopedBrand(brandId);
  const payload = await request(
    workspace,
    `/brands/${brandSegment(brandId)}/imported-sources/${sourceSegment(sourceId)}/media`,
    'POST',
    'Could not prepare this media.',
    { requestId: crypto.randomUUID() },
  );
  return parseMedia(
    deserializeResource<unknown>(payload as JsonApiResponseDocument),
  );
}

export async function observeSourceMedia(
  brandId: string,
  sourceId: string,
  signal?: AbortSignal,
): Promise<ImportedSourceMediaView> {
  const workspace = await scopedBrand(brandId);
  const payload = await request(
    workspace,
    `/brands/${brandSegment(brandId)}/imported-sources/${sourceSegment(sourceId)}/media`,
    'GET',
    'Could not check this media.',
    undefined,
    signal,
  );
  return parseMedia(
    deserializeResource<unknown>(payload as JsonApiResponseDocument),
  );
}

/** A retry is a new, explicit request fenced to the revision the user saw fail. */
export async function retrySourceMedia(
  brandId: string,
  sourceId: string,
  expectedIngestRevision: number,
): Promise<ImportedSourceMediaView> {
  const workspace = await scopedBrand(brandId);
  const payload = await request(
    workspace,
    `/brands/${brandSegment(brandId)}/imported-sources/${sourceSegment(sourceId)}/media/retry`,
    'POST',
    'Could not retry this media.',
    { expectedIngestRevision, requestId: crypto.randomUUID() },
  );
  return parseMedia(
    deserializeResource<unknown>(payload as JsonApiResponseDocument),
  );
}
