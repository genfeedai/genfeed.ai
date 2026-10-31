import {
  executeBrandRemixGenerationSchema,
  quoteBrandRemixGenerationSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-generation.contract';
import {
  type BrandRemixRunView,
  brandRemixRunViewSchema,
  createBrandRemixRunSchema,
  reviseBrandRemixRunSchema,
} from '@genfeedai/contracts/api-types/contracts/brand-remix-run.contract';
import {
  APP_ROUTES,
  createBrandAppRoute,
} from '@genfeedai/contracts/constants';
import type { ExtensionWorkspaceSnapshot } from '@genfeedai/contracts/interfaces';
import {
  deserializeCollection,
  deserializeResource,
  type JsonApiResponseDocument,
} from '@genfeedai/helpers/data/json-api/json-api.helper';
import { isObjectLike } from '@genfeedai/utils/data/extract.util';
import { Storage } from '@plasmohq/storage';
import type {
  SourceRemixEdits,
  SourceRemixImageModel,
} from '~models/source-remix.model';
import { appDomain } from '~services/environment.service';
import {
  assertWorkspace,
  requireWorkspace,
  scopedWorkspaceRequest,
} from '~services/workspace.service';

const REQUEST_TIMEOUT_MS = 30_000;
const SLUG_PATTERN = /^[a-zA-Z0-9][a-zA-Z0-9-]*$/;
const MODEL_LIMIT = 100;
const storage = new Storage({ area: 'local' });

export class SourceRemixError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SourceRemixError';
  }
}

function readMessage(body: unknown, fallback: string): string {
  if (!isObjectLike(body)) return fallback;
  for (const key of ['detail', 'message', 'title'] as const) {
    const value = body[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (Array.isArray(value)) {
      const first = value.find(
        (item): item is string =>
          typeof item === 'string' && item.trim() !== '',
      );
      if (first) return first.trim();
    }
  }
  return fallback;
}

async function scoped(brandId?: string): Promise<ExtensionWorkspaceSnapshot> {
  const workspace = await requireWorkspace();
  if (!workspace.brandId) {
    throw new SourceRemixError('Select a brand before remixing a source.');
  }
  if (brandId !== undefined && brandId !== workspace.brandId) {
    throw new SourceRemixError(
      'Select the original brand before remixing this source.',
    );
  }
  return workspace;
}

async function request(
  workspace: ExtensionWorkspaceSnapshot,
  path: string,
  method: 'GET' | 'PATCH' | 'POST',
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
  let payload: unknown = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }
  assertWorkspace(workspace);
  if (response.status === 401) {
    throw new SourceRemixError('Sign in again, then retry.');
  }
  if (response.status === 402) {
    throw new SourceRemixError(
      'You do not have enough credits for this generation. Nothing was charged.',
    );
  }
  if (!response.ok) {
    throw new SourceRemixError(readMessage(payload, fallback));
  }
  return payload;
}

/** Parses the remix view without letting the document mapper rewrite scene keys. */
export function parseRemixRun(
  payload: unknown,
  workspace: ExtensionWorkspaceSnapshot,
): BrandRemixRunView {
  const document = payload as JsonApiResponseDocument;
  const primary = document?.data;
  if (!primary || Array.isArray(primary) || !primary.attributes) {
    throw new SourceRemixError('Genfeed returned an incomplete remix.');
  }
  const { scenePipeline, ...attributes } = primary.attributes;
  const normalized = deserializeResource<Record<string, unknown>>({
    ...document,
    data: { ...primary, attributes },
  });
  const parsed = brandRemixRunViewSchema.safeParse({
    ...normalized,
    ...(scenePipeline === undefined ? {} : { scenePipeline }),
  });
  if (!parsed.success) {
    throw new SourceRemixError(
      'Genfeed returned a remix this extension cannot read. Update the extension.',
    );
  }
  if (parsed.data.brandId !== workspace.brandId) {
    throw new SourceRemixError(
      'This remix belongs to another brand. Select the original brand.',
    );
  }
  return parsed.data;
}

const runKey = (workspace: ExtensionWorkspaceSnapshot, sourceId: string) =>
  `source_remix_run:${workspace.userId}:${workspace.organizationId}:${workspace.brandId}:${sourceId}`;

/** Creates a new brand-scoped draft remix for a saved source. It starts no generation. */
export async function createSourceRemix(
  brandId: string,
  sourceId: string,
): Promise<BrandRemixRunView> {
  const workspace = await scoped(brandId);
  const body = createBrandRemixRunSchema.parse({
    source: { importedSourceId: sourceId, kind: 'imported_source' },
  });
  const run = parseRemixRun(
    await request(
      workspace,
      `/brands/${encodeURIComponent(brandId)}/content-runs/remixes`,
      'POST',
      'Could not start this remix.',
      body,
    ),
    workspace,
  );
  await storage.set(runKey(workspace, sourceId), run.id);
  return run;
}

export async function getSourceRemix(
  runId: string,
  signal?: AbortSignal,
): Promise<BrandRemixRunView> {
  const workspace = await scoped();
  return parseRemixRun(
    await request(
      workspace,
      `/content-runs/${encodeURIComponent(runId)}/remix`,
      'GET',
      'Could not load this remix.',
      undefined,
      signal,
    ),
    workspace,
  );
}

/** Reopens the remix last started for this source, or creates a draft when there is none. */
export async function openSourceRemix(
  brandId: string,
  sourceId: string,
): Promise<BrandRemixRunView> {
  const workspace = await scoped(brandId);
  const remembered = await storage.get<string>(runKey(workspace, sourceId));
  if (remembered) {
    try {
      const run = await getSourceRemix(remembered);
      if (
        run.sourceSnapshot.selector.kind === 'imported_source' &&
        run.sourceSnapshot.selector.importedSourceId === sourceId
      ) {
        return run;
      }
    } catch {
      // A missing or unreadable earlier remix is replaced by a fresh draft.
    }
  }
  return createSourceRemix(brandId, sourceId);
}

export async function reviseSourceRemix(
  runId: string,
  expectedRevision: number,
  edits: SourceRemixEdits,
): Promise<BrandRemixRunView> {
  const workspace = await scoped();
  const body = reviseBrandRemixRunSchema.parse({ edits, expectedRevision });
  return parseRemixRun(
    await request(
      workspace,
      `/content-runs/${encodeURIComponent(runId)}/remix`,
      'PATCH',
      'Could not change this remix.',
      body,
    ),
    workspace,
  );
}

/** A quote prices the generation. It reserves nothing and starts nothing. */
export async function quoteSourceRemix(
  runId: string,
  expectedRevision: number,
  model?: string,
): Promise<BrandRemixRunView> {
  const workspace = await scoped();
  const body = quoteBrandRemixGenerationSchema.parse({
    expectedRevision,
    ...(model ? { model } : {}),
  });
  return parseRemixRun(
    await request(
      workspace,
      `/content-runs/${encodeURIComponent(runId)}/remix/generation/quote`,
      'POST',
      'Could not price this remix.',
      body,
    ),
    workspace,
  );
}

/** The one call that can spend credits. It needs the quote the user approved. */
export async function executeSourceRemix(
  runId: string,
  expectedRevision: number,
  quoteId: string,
): Promise<BrandRemixRunView> {
  const workspace = await scoped();
  const body = executeBrandRemixGenerationSchema.parse({
    expectedRevision,
    quoteId,
  });
  return parseRemixRun(
    await request(
      workspace,
      `/content-runs/${encodeURIComponent(runId)}/remix/generation/execute`,
      'POST',
      'Could not start this generation.',
      body,
    ),
    workspace,
  );
}

/** Image models the organization has enabled; the quote validates the choice again. */
export async function listSourceRemixImageModels(): Promise<
  SourceRemixImageModel[]
> {
  const workspace = await scoped();
  const payload = await request(
    workspace,
    `/models?category=image&organizationId=${encodeURIComponent(workspace.organizationId)}&limit=${MODEL_LIMIT}`,
    'GET',
    'Could not load image models.',
  );
  return deserializeCollection<Record<string, unknown>>(
    payload as JsonApiResponseDocument,
  ).flatMap((model) =>
    typeof model.key === 'string' &&
    typeof model.label === 'string' &&
    model.isActive !== false &&
    !model.key.startsWith('crun/')
      ? [
          {
            key: model.key,
            label: model.label,
            ...(typeof model.provider === 'string'
              ? { provider: model.provider }
              : {}),
          },
        ]
      : [],
  );
}

function readSlug(payload: unknown, brandId: string): string | null {
  if (!isObjectLike(payload) || !isObjectLike(payload.data)) return null;
  if (payload.data.id !== brandId || !isObjectLike(payload.data.attributes)) {
    return null;
  }
  const slug = payload.data.attributes.slug;
  return typeof slug === 'string' ? slug.trim() : null;
}

function readActiveOrganizationSlug(payload: unknown): string | null {
  const rows = Array.isArray(payload) ? payload : [];
  const chosen =
    rows.find(
      (row) =>
        isObjectLike(row) &&
        row.isActive === true &&
        typeof row.slug === 'string',
    ) ?? rows.find((row) => isObjectLike(row) && typeof row.slug === 'string');
  return isObjectLike(chosen) && typeof chosen.slug === 'string'
    ? chosen.slug.trim()
    : null;
}

/** The Studio page for a run, for outputs the panel hands off (video and avatar). */
export async function resolveSourceRemixStudioUrl(
  runId: string,
): Promise<string> {
  const workspace = await scoped();
  const brandId = workspace.brandId ?? '';
  const [brand, organizations] = await Promise.all([
    request(
      workspace,
      `/brands/${encodeURIComponent(brandId)}`,
      'GET',
      'Could not open Studio.',
    ),
    request(
      workspace,
      '/organizations?mine=true',
      'GET',
      'Could not open Studio.',
    ),
  ]);
  const brandSlug = readSlug(brand, brandId);
  const organizationSlug = readActiveOrganizationSlug(organizations);
  if (
    !brandSlug ||
    !organizationSlug ||
    !SLUG_PATTERN.test(brandSlug) ||
    !SLUG_PATTERN.test(organizationSlug)
  ) {
    throw new SourceRemixError('This brand has no workspace link for Studio.');
  }
  return `${appDomain}${createBrandAppRoute(
    organizationSlug,
    brandSlug,
    `${APP_ROUTES.STUDIO.STORYBOARD}/${encodeURIComponent(runId)}`,
  )}`;
}
