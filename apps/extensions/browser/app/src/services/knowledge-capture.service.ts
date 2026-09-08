import { KnowledgeSourcePurpose } from '@genfeedai/contracts';
import { Storage } from '@plasmohq/storage';
import type {
  KnowledgeCaptureDraft,
  KnowledgeCaptureReceipt,
  KnowledgeCaptureSpace,
} from '~models/knowledge-capture.model';
import { authService } from '~services/auth.service';
import { apiEndpoint } from '~services/environment.service';
import { prepareKnowledgeSnapshot } from '~utils/knowledge-snapshot.util';

const storage = new Storage({ area: 'local' });
const MAX_PENDING = 10;
const MAX_RECEIPTS = 50;
let operations: Promise<unknown> = Promise.resolve();

interface Resource {
  id: string;
  attributes?: Record<string, unknown>;
}
interface ApiResult {
  data: Resource | Resource[];
  versionId?: string;
  meta?: { totalPages?: number; pagination?: { totalPages?: number } };
}
interface CaptureSession {
  key: string;
  token: string;
}

async function session(): Promise<CaptureSession> {
  const token = await authService.getToken();
  const context = token ? await authService.getAuthContext() : null;
  if (!token || !context?.organization?.id || !context.user?.id) {
    throw new Error(
      'Sign in to Genfeed and select your workspace before saving.',
    );
  }
  return {
    key: `knowledge_outbox:${context.organization.id}:${context.user.id}`,
    token,
  };
}

async function request(
  current: CaptureSession,
  path: string,
  method = 'GET',
  body?: unknown,
  key?: string,
): Promise<ApiResult> {
  const response = await fetch(`${apiEndpoint}${path}`, {
    method,
    signal: AbortSignal.timeout(20_000),
    headers: {
      Authorization: `Bearer ${current.token}`,
      'Content-Type': 'application/json',
      ...(key ? { 'Idempotency-Key': key } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    if (response.status === 401)
      throw new Error('Sign in again, then retry this capture.');
    if (response.status === 403 || response.status === 404)
      throw new Error(
        'This brand or source is no longer available. Select an accessible brand.',
      );
    if (response.status === 413)
      throw new Error('This capture is too large. Select a shorter passage.');
    if (response.status === 409)
      throw new Error(
        'This capture changed after saving. Start a new capture.',
      );
    throw new Error(
      'Genfeed could not finish saving. Your capture is kept here for retry.',
    );
  }
  return response.json();
}

function resource(result: ApiResult): Resource {
  if (!result.data || Array.isArray(result.data) || !result.data.id)
    throw new Error(
      'Genfeed returned an incomplete capture receipt. Retry to recover it.',
    );
  return result.data;
}

const scope = (brandId: string) => `brandId=${encodeURIComponent(brandId)}`;

async function saveReceipts(
  current: CaptureSession,
  rows: KnowledgeCaptureReceipt[],
) {
  const pending = rows.filter((row) => row.draft);
  const receipts = rows.filter((row) => !row.draft).slice(0, MAX_RECEIPTS);
  await storage.set(current.key, [...pending, ...receipts]);
}

async function rows(
  current: CaptureSession,
): Promise<KnowledgeCaptureReceipt[]> {
  return (await storage.get<KnowledgeCaptureReceipt[]>(current.key)) ?? [];
}

function serialize<T>(action: () => Promise<T>): Promise<T> {
  const next = operations.then(action, action);
  operations = next.catch(() => undefined);
  return next;
}

async function deliver(
  current: CaptureSession,
  row: KnowledgeCaptureReceipt,
  receipts: KnowledgeCaptureReceipt[],
): Promise<KnowledgeCaptureReceipt> {
  if (!row.draft) return row;
  try {
    const draft = row.draft;
    if (!row.sourceId) {
      const response = await request(
        current,
        `/knowledge-sources?${scope(draft.brandId)}`,
        'POST',
        {
          scope: 'brand',
          title:
            draft.title ||
            draft.text.slice(0, 80) ||
            new URL(draft.url).hostname,
          kind: draft.text ? 'TEXT' : 'URL',
          purpose: draft.purpose,
          ...(draft.text ? { text: draft.text } : {}),
          ...(draft.url ? { referenceUrl: draft.url } : {}),
          provenance: {
            capturedBy: 'extension',
            capturedAt: row.createdAt,
            captureId: row.id,
            mode: draft.mode,
            ...(draft.url ? { url: draft.url } : {}),
          },
        },
        row.id,
      );
      if (!response.versionId)
        throw new Error(
          'Genfeed returned an incomplete capture receipt. Retry to recover it.',
        );
      row.sourceId = resource(response).id;
      row.versionId = response.versionId;
      // Persist identity before a membership request so its retry never recreates the source.
      await saveReceipts(current, receipts);
    }
    if (draft.spaceId) {
      await request(
        current,
        `/knowledge-spaces/${encodeURIComponent(draft.spaceId)}/memberships/${encodeURIComponent(row.sourceId)}?${scope(draft.brandId)}`,
        'PUT',
      );
    }
    row.state = 'queued';
    row.error = undefined;
    row.draft = undefined;
  } catch (error) {
    row.state = 'failed';
    row.error =
      error instanceof TypeError
        ? 'You appear to be offline. Reconnect and retry this capture.'
        : error instanceof Error
          ? error.message
          : 'Capture failed. Retry when connected.';
  }
  await saveReceipts(current, receipts);
  return row;
}

export function enqueueKnowledgeCapture(
  input: KnowledgeCaptureDraft,
): Promise<KnowledgeCaptureReceipt> {
  return serialize(async () => {
    const current = await session();
    if (!input.brandId?.trim())
      throw new Error('Select a brand before saving.');
    if (!Object.values(KnowledgeSourcePurpose).includes(input.purpose))
      throw new Error('Select a capture purpose.');
    const draft: KnowledgeCaptureDraft = {
      ...prepareKnowledgeSnapshot(input),
      brandId: input.brandId,
      purpose: input.purpose,
      ...(input.spaceId ? { spaceId: input.spaceId } : {}),
    };
    const receipts = await rows(current);
    // Repeated clicks on an unconfirmed capture reuse its durable enqueue identity.
    const pending = receipts.find(
      (row) => row.draft && JSON.stringify(row.draft) === JSON.stringify(draft),
    );
    if (pending) return deliver(current, pending, receipts);
    if (receipts.filter((row) => row.draft).length >= MAX_PENDING)
      throw new Error(
        'Ten captures are waiting. Retry or discard one before adding another.',
      );
    const row: KnowledgeCaptureReceipt = {
      id: crypto.randomUUID(),
      brandId: draft.brandId,
      title: draft.title || 'Captured source',
      spaceId: draft.spaceId,
      state: 'pending',
      createdAt: new Date().toISOString(),
      draft,
    };
    receipts.unshift(row);
    await saveReceipts(current, receipts);
    return deliver(current, row, receipts);
  });
}

export function retryKnowledgeCapture(
  id: string,
): Promise<KnowledgeCaptureReceipt> {
  return serialize(async () => {
    const current = await session();
    const receipts = await rows(current);
    const row = receipts.find((item) => item.id === id);
    if (!row)
      throw new Error(
        'This capture belongs to another workspace or has been discarded.',
      );
    if (row.draft) return deliver(current, row, receipts);
    if (row.sourceId && row.state === 'failed') {
      const response = await request(
        current,
        `/knowledge-sources/${encodeURIComponent(row.sourceId)}/retry?${scope(row.brandId)}`,
        'POST',
      );
      row.versionId = resource(response).id;
      row.state = 'queued';
      row.error = undefined;
      await saveReceipts(current, receipts);
    }
    return row;
  });
}

export function listKnowledgeCaptures(): Promise<KnowledgeCaptureReceipt[]> {
  return serialize(async () => {
    const current = await session();
    const receipts = await rows(current);
    for (const row of receipts.filter(
      (item) =>
        item.sourceId &&
        item.versionId &&
        !item.draft &&
        item.state !== 'ready',
    )) {
      try {
        const response = await request(
          current,
          `/knowledge-sources/${encodeURIComponent(row.sourceId ?? '')}/versions/${encodeURIComponent(row.versionId ?? '')}?${scope(row.brandId)}`,
        );
        const state = resource(response).attributes?.processingState;
        if (
          state === 'READY' ||
          state === 'PROCESSING' ||
          state === 'QUEUED' ||
          state === 'FAILED'
        ) {
          row.state = state.toLowerCase() as KnowledgeCaptureReceipt['state'];
          row.error =
            state === 'FAILED'
              ? 'Processing failed. Retry this source.'
              : undefined;
        }
      } catch {
        // A failed status read is not evidence that ingestion failed.
        break;
      }
    }
    await saveReceipts(current, receipts);
    return receipts;
  });
}

export function discardKnowledgeCapture(id: string): Promise<void> {
  return serialize(async () => {
    const current = await session();
    await saveReceipts(
      current,
      (await rows(current)).filter((item) => item.id !== id),
    );
  });
}

export async function listCaptureSpaces(
  brandId: string,
): Promise<KnowledgeCaptureSpace[]> {
  if (!brandId) return [];
  const current = await session();
  const spaces: KnowledgeCaptureSpace[] = [];
  for (let page = 1; ; page++) {
    const result = await request(
      current,
      `/knowledge-spaces?${scope(brandId)}&page=${page}&limit=100`,
    );
    if (!Array.isArray(result.data))
      throw new Error('Could not load Knowledge spaces.');
    for (const item of result.data) {
      if (
        item.attributes?.scope === 'brand' &&
        item.attributes.brandId === brandId
      )
        spaces.push({
          id: item.id,
          title: String(item.attributes.title ?? ''),
          isInbox: item.attributes.isInbox === true,
        });
    }
    if (result.data.length < 100) break;
  }
  return spaces;
}

export async function getCaptureBrand(): Promise<string | null> {
  const current = await session();
  return (await storage.get<string>(`${current.key}:brand`)) ?? null;
}

export async function setCaptureBrand(brandId: string): Promise<void> {
  const current = await session();
  await storage.set(`${current.key}:brand`, brandId);
}

const legacyStorage = new Storage();
interface LegacyIdea {
  id: string;
  title?: string;
  url: string;
}

export async function legacyCaptureCount(): Promise<number> {
  return ((await legacyStorage.get<LegacyIdea[]>('saved_ideas')) ?? []).length;
}

/** Only explicit import moves earlier device-local ideas into the selected brand. */
export async function importLegacyCaptures(brandId: string): Promise<void> {
  if (!brandId) throw new Error('Select a brand before importing saved ideas.');
  const ideas = (await legacyStorage.get<LegacyIdea[]>('saved_ideas')) ?? [];
  for (const idea of ideas) {
    await enqueueKnowledgeCapture({
      brandId,
      mode: 'link',
      title: idea.title ?? '',
      url: idea.url,
      text: '',
      purpose: KnowledgeSourcePurpose.INSPIRATION,
    });
    const remaining = (
      (await legacyStorage.get<LegacyIdea[]>('saved_ideas')) ?? []
    ).filter((item) => item.id !== idea.id);
    await legacyStorage.set('saved_ideas', remaining);
  }
}
