import { createHash } from 'node:crypto';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PublishResult } from '@api/index';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { readPostString } from '@workers/services/scheduled-post.utils';
import { readScheduledDeliveryResult } from '@workers/services/scheduled-post-delivery-input.util';

type ReceiptClient = Pick<PrismaService, 'postProviderPublishReceipt'>;

const ATTEMPTING = 'attempting';
const ACCEPTED = 'accepted';
const RELEASED = 'released';

/**
 * What a delivery attempt may do for the post's current occurrence:
 * - `publish`: no unresolved attempt exists; call the provider.
 * - `replay`: the provider already accepted this occurrence; persist its result.
 * - `ambiguous`: an earlier attempt never recorded its provider outcome; the
 *   provider may have published, so publishing again is refused.
 */
export type ProviderPublishAttempt =
  | { kind: 'publish'; receiptId: string }
  | { kind: 'replay'; receiptId: string; result: PublishResult }
  | { kind: 'ambiguous'; receiptId: string };

/**
 * The provider accepted the publish but its state transition failed. Callers
 * must not schedule a publish retry: the next delivery attempt replays the
 * recorded receipt instead of publishing to the provider again.
 */
export class ProviderPublishPersistenceError extends Error {
  constructor(
    readonly postId: string,
    readonly externalId: string | null,
    cause: unknown,
  ) {
    super('Provider publish succeeded but its state transition failed.', {
      cause,
    });
    this.name = 'ProviderPublishPersistenceError';
  }
}

function readDate(post: PostEntity, key: string): string | null {
  const value = (post as unknown as Record<string, unknown>)[key];
  // Delivery and discovery loaders may surface the same instant as a Date or
  // an ISO string; both must produce the same occurrence key.
  const date =
    value instanceof Date
      ? value
      : typeof value === 'string'
        ? new Date(value)
        : null;
  return date && Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function readIngredientIds(post: PostEntity): string[] {
  const ingredients = (post as unknown as Record<string, unknown>).ingredients;
  if (!Array.isArray(ingredients)) return [];
  return ingredients
    .map((ingredient: unknown) =>
      ingredient && typeof ingredient === 'object' && 'id' in ingredient
        ? String((ingredient as { id: unknown }).id)
        : '',
    )
    .filter((id) => id.length > 0)
    .sort();
}

/**
 * One publish occurrence: the post, its active approval and approved version,
 * its schedule and its publishable content. Retries keep the key; a reapproval,
 * reschedule or content edit starts a new occurrence.
 */
export function providerPublishOccurrenceKey(post: PostEntity): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        String(post.id ?? ''),
        readPostString(post, ['publishApprovalId']) ?? null,
        readPostString(post, ['reviewVersionPinId']) ?? null,
        readDate(post, 'scheduledDate'),
        readPostString(post, ['description']) ?? null,
        readIngredientIds(post),
      ]),
    )
    .digest('hex');
}

function receiptScope(post: PostEntity): {
  organizationId: string;
  postId: string;
} | null {
  const organizationId = readPostString(post, ['organizationId']);
  const postId = post.id ? String(post.id) : '';
  return organizationId && postId ? { organizationId, postId } : null;
}

function readReceiptResult(
  value: Prisma.JsonValue | null,
): PublishResult | null {
  if (value === null) return null;
  const result = readScheduledDeliveryResult(value);
  if (
    !result.success ||
    (result.executionState !== TargetExecutionState.PUBLISHED &&
      result.executionState !== TargetExecutionState.PUBLISHING)
  )
    return null;
  const record = value as Record<string, unknown>;
  return typeof record.externalShortcode === 'string'
    ? { ...result, externalShortcode: record.externalShortcode }
    : result;
}

/** Latest unreleased attempt for the post's current occurrence. */
export async function findProviderPublishAttempt(
  prisma: ReceiptClient,
  post: PostEntity,
): Promise<Exclude<ProviderPublishAttempt, { kind: 'publish' }> | null> {
  const scope = receiptScope(post);
  if (!scope) return null;
  const receipt = await prisma.postProviderPublishReceipt.findFirst({
    where: {
      ...scope,
      occurrenceKey: providerPublishOccurrenceKey(post),
      status: { in: [ATTEMPTING, ACCEPTED] },
      isDeleted: false,
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, result: true, status: true },
  });
  if (!receipt) return null;
  const result =
    receipt.status === ACCEPTED ? readReceiptResult(receipt.result) : null;
  return result
    ? { kind: 'replay', receiptId: receipt.id, result }
    : { kind: 'ambiguous', receiptId: receipt.id };
}

/**
 * Resolve this attempt before any provider call. A new attempt is recorded
 * durably first; if that write fails the provider is never called.
 */
export async function beginProviderPublishAttempt(
  prisma: ReceiptClient,
  post: PostEntity,
  workflowExecutionId: string,
): Promise<ProviderPublishAttempt> {
  const scope = receiptScope(post);
  if (!scope)
    throw new Error('Provider publish attempt requires a post organization.');
  const existing = await findProviderPublishAttempt(prisma, post);
  if (existing) return existing;
  const receipt = await prisma.postProviderPublishReceipt.upsert({
    where: {
      organizationId_postId_workflowExecutionId: {
        ...scope,
        workflowExecutionId,
      },
    },
    create: {
      ...scope,
      workflowExecutionId,
      occurrenceKey: providerPublishOccurrenceKey(post),
      status: ATTEMPTING,
    },
    update: {
      occurrenceKey: providerPublishOccurrenceKey(post),
      status: ATTEMPTING,
      externalId: null,
      persistedAt: null,
    },
    select: { id: true },
  });
  return { kind: 'publish', receiptId: receipt.id };
}

async function updateReceipt(
  prisma: ReceiptClient,
  post: PostEntity,
  receiptId: string,
  data: Prisma.PostProviderPublishReceiptUpdateManyMutationInput,
): Promise<void> {
  const scope = receiptScope(post);
  if (!scope) return;
  await prisma.postProviderPublishReceipt.updateMany({
    where: { id: receiptId, ...scope, isDeleted: false },
    data,
  });
}

export function acceptProviderPublishAttempt(
  prisma: ReceiptClient,
  post: PostEntity,
  receiptId: string,
  result: PublishResult,
): Promise<void> {
  return updateReceipt(prisma, post, receiptId, {
    status: ACCEPTED,
    externalId: result.externalId,
    result: { ...result } as Prisma.InputJsonObject,
  });
}

/** The provider definitively did not publish; a retry may publish again. */
export function releaseProviderPublishAttempt(
  prisma: ReceiptClient,
  post: PostEntity,
  receiptId: string,
): Promise<void> {
  return updateReceipt(prisma, post, receiptId, { status: RELEASED });
}

export function markProviderReceiptPersisted(
  prisma: ReceiptClient,
  post: PostEntity,
  receiptId: string,
): Promise<void> {
  return updateReceipt(prisma, post, receiptId, { persistedAt: new Date() });
}
