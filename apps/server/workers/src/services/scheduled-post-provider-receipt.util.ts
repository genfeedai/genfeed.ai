import { createHash, randomUUID } from 'node:crypto';
import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PublishResult } from '@api/index';
import { TargetExecutionState } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { readPostString } from '@workers/services/scheduled-post.utils';
import { readScheduledDeliveryResult } from '@workers/services/scheduled-post-delivery-input.util';

type ReceiptClient = Pick<PrismaService, 'postProviderPublishReceipt'>;

type ReceiptStatus = 'attempting' | 'accepted' | 'uncertain' | 'released';
export type ProviderPublishAttemptRef = {
  receiptId: string;
  attemptToken: string;
};

/** An attempt whose lease was renewed this recently is in flight. */
export const PROVIDER_PUBLISH_ATTEMPT_LEASE_MS = 30 * 60_000;
/** How often a delivery renews its lease while the provider call runs. */
export const PROVIDER_PUBLISH_LEASE_RENEWAL_MS = 5 * 60_000;
const MAX_RESERVATION_ROUNDS = 3;

/**
 * The provider-attempt state of the post's current occurrence:
 * - `none` / `released`: no unresolved attempt; a delivery may reserve one.
 * - `replay`: the provider accepted this occurrence; persist its result.
 * - `unconfirmed`: an earlier attempt never confirmed its provider outcome;
 *   verify it with the provider before publishing again.
 * - `in_flight`: another delivery holds a live attempt for this occurrence.
 */
type AttemptRef = ProviderPublishAttemptRef;

export type ProviderPublishAttemptState =
  | { kind: 'none' }
  | ({ kind: 'released' } & AttemptRef)
  | ({ kind: 'replay'; result: PublishResult } & AttemptRef)
  | ({
      kind: 'unconfirmed';
      status: ReceiptStatus;
      attemptStartedAt: Date;
    } & AttemptRef)
  | ({ kind: 'in_flight' } & AttemptRef);

/** What a delivery that reserved (or found) the occurrence's attempt may do. */
export type ProviderPublishAttempt =
  | ({ kind: 'publish' } & AttemptRef)
  | Extract<
      ProviderPublishAttemptState,
      { kind: 'replay' | 'unconfirmed' | 'in_flight' }
    >;

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

/**
 * The occurrence's attempt state could not be read or held. It may already be
 * published, so the target is neither failed nor retried until it can be.
 */
export class ProviderPublishAttemptUnavailableError extends Error {
  readonly postId: string;

  constructor(postId: unknown, cause: unknown) {
    super('Provider publish attempt state is unavailable.', { cause });
    this.name = 'ProviderPublishAttemptUnavailableError';
    this.postId = String(postId);
  }
}

/** Another delivery holds a live provider attempt for this occurrence. */
export class ProviderPublishInFlightError extends Error {
  constructor(readonly postId: string) {
    super('Another delivery is publishing this post occurrence.');
    this.name = 'ProviderPublishInFlightError';
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

function occurrenceScope(post: PostEntity): {
  organizationId: string;
  postId: string;
  occurrenceKey: string;
} {
  const organizationId = readPostString(post, ['organizationId']);
  const postId = post.id ? String(post.id) : '';
  if (!organizationId || !postId)
    throw new Error('Provider publish attempt requires a post organization.');
  return {
    organizationId,
    postId,
    occurrenceKey: providerPublishOccurrenceKey(post),
  };
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

function isUniqueConflict(error: unknown): boolean {
  return (
    error !== null &&
    typeof error === 'object' &&
    'code' in error &&
    error.code === 'P2002'
  );
}

/**
 * Read-only state of the occurrence's attempt. A live `attempting` row is in
 * flight whoever owns it, including a duplicate run of the same execution.
 */
export async function inspectProviderPublishAttempt(
  prisma: ReceiptClient,
  post: PostEntity,
  now: Date = new Date(),
): Promise<ProviderPublishAttemptState> {
  const row = await prisma.postProviderPublishReceipt.findFirst({
    where: { ...occurrenceScope(post), isDeleted: false },
    select: {
      attemptStartedAt: true,
      attemptToken: true,
      id: true,
      leaseRenewedAt: true,
      result: true,
      status: true,
    },
  });
  if (!row) return { kind: 'none' };
  const ref = { receiptId: row.id, attemptToken: row.attemptToken };
  const status = row.status as ReceiptStatus;
  if (status === 'released') return { kind: 'released', ...ref };
  const result = status === 'accepted' ? readReceiptResult(row.result) : null;
  if (result) return { kind: 'replay', result, ...ref };
  if (
    status === 'attempting' &&
    now.getTime() - row.leaseRenewedAt.getTime() <
      PROVIDER_PUBLISH_ATTEMPT_LEASE_MS
  )
    return { kind: 'in_flight', ...ref };
  return {
    kind: 'unconfirmed',
    status,
    attemptStartedAt: row.attemptStartedAt,
    ...ref,
  };
}

/**
 * Take over an attempt row observed with `observed.attemptToken`. The token
 * changes on every takeover, so exactly one concurrent delivery wins; losers
 * get null and must not call the provider. An `attempting` row is only taken
 * over once its lease expired, so a holder that renewed it keeps it.
 */
export async function claimProviderPublishAttempt(
  prisma: ReceiptClient,
  post: PostEntity,
  observed: AttemptRef & { status: ReceiptStatus },
  workflowExecutionId: string,
  now: Date = new Date(),
): Promise<AttemptRef | null> {
  const { organizationId, postId } = occurrenceScope(post);
  const attemptToken = randomUUID();
  const claimed = await prisma.postProviderPublishReceipt.updateMany({
    where: {
      id: observed.receiptId,
      organizationId,
      postId,
      attemptToken: observed.attemptToken,
      // An attempt accepted meanwhile keeps its token; the status check stops
      // a stale takeover from erasing its result.
      status: observed.status,
      ...(observed.status === 'attempting'
        ? {
            leaseRenewedAt: {
              lt: new Date(now.getTime() - PROVIDER_PUBLISH_ATTEMPT_LEASE_MS),
            },
          }
        : {}),
      isDeleted: false,
    },
    data: {
      attemptStartedAt: now,
      attemptToken,
      leaseRenewedAt: now,
      externalId: null,
      persistedAt: null,
      result: Prisma.DbNull,
      status: 'attempting',
      workflowExecutionId,
    },
  });
  return claimed.count === 1
    ? { receiptId: observed.receiptId, attemptToken }
    : null;
}

/**
 * Reserve the occurrence's provider attempt before any provider call. The
 * occurrence row is unique, so concurrent deliveries cannot both publish; if
 * the reservation write fails the provider is never called.
 */
export async function reserveProviderPublishAttempt(
  prisma: ReceiptClient,
  post: PostEntity,
  workflowExecutionId: string,
  now: Date = new Date(),
): Promise<ProviderPublishAttempt> {
  for (let round = 0; round < MAX_RESERVATION_ROUNDS; round++) {
    const state = await inspectProviderPublishAttempt(prisma, post, now);
    if (state.kind === 'none') {
      const attemptToken = randomUUID();
      try {
        const created = await prisma.postProviderPublishReceipt.create({
          data: {
            ...occurrenceScope(post),
            attemptStartedAt: now,
            attemptToken,
            leaseRenewedAt: now,
            status: 'attempting',
            workflowExecutionId,
          },
          select: { id: true },
        });
        return { kind: 'publish', receiptId: created.id, attemptToken };
      } catch (error: unknown) {
        if (!isUniqueConflict(error)) throw error;
        continue;
      }
    }
    if (state.kind === 'released') {
      const claimed = await claimProviderPublishAttempt(
        prisma,
        post,
        { ...state, status: 'released' },
        workflowExecutionId,
        now,
      );
      if (claimed) return { kind: 'publish', ...claimed };
      continue;
    }
    return state;
  }
  throw new ProviderPublishInFlightError(String(post.id));
}

/** Settle only the attempt this delivery holds; a taken-over row is left alone. */
async function updateAttempt(
  prisma: ReceiptClient,
  post: PostEntity,
  attempt: AttemptRef,
  data: Prisma.PostProviderPublishReceiptUpdateManyMutationInput,
): Promise<void> {
  const { organizationId, postId } = occurrenceScope(post);
  await prisma.postProviderPublishReceipt.updateMany({
    where: {
      id: attempt.receiptId,
      organizationId,
      postId,
      attemptToken: attempt.attemptToken,
      isDeleted: false,
    },
    data,
  });
}

/**
 * Renew the lease of the live attempt this delivery holds. False once another
 * delivery took it over or it was settled: the holder must not call the
 * provider. `isProviderCallStart` restarts the attempt clock that provider
 * verification searches from; renewals during the call keep it.
 */
export async function renewProviderPublishAttempt(
  prisma: ReceiptClient,
  post: PostEntity,
  attempt: AttemptRef,
  isProviderCallStart: boolean,
  now: Date = new Date(),
): Promise<boolean> {
  const { organizationId, postId } = occurrenceScope(post);
  const renewed = await prisma.postProviderPublishReceipt.updateMany({
    where: {
      id: attempt.receiptId,
      organizationId,
      postId,
      attemptToken: attempt.attemptToken,
      status: 'attempting',
      isDeleted: false,
    },
    data: isProviderCallStart
      ? { attemptStartedAt: now, leaseRenewedAt: now }
      : { leaseRenewedAt: now },
  });
  return renewed.count === 1;
}

export function acceptProviderPublishAttempt(
  prisma: ReceiptClient,
  post: PostEntity,
  attempt: AttemptRef,
  result: PublishResult,
): Promise<void> {
  return updateAttempt(prisma, post, attempt, {
    status: 'accepted',
    externalId: result.externalId,
    result: { ...result } as Prisma.InputJsonObject,
  });
}

/** The provider outcome is unknown (timeout, reset, 5xx); verify on retry. */
export function markProviderPublishAttemptUncertain(
  prisma: ReceiptClient,
  post: PostEntity,
  attempt: AttemptRef,
): Promise<void> {
  return updateAttempt(prisma, post, attempt, { status: 'uncertain' });
}

/** The provider definitively did not publish; a retry may publish again. */
export function releaseProviderPublishAttempt(
  prisma: ReceiptClient,
  post: PostEntity,
  attempt: AttemptRef,
): Promise<void> {
  return updateAttempt(prisma, post, attempt, { status: 'released' });
}

/**
 * The state transition persisted: record the accepted result in the same write,
 * so the receipt resolves even when the earlier accept write failed.
 */
export function markProviderReceiptPersisted(
  prisma: ReceiptClient,
  post: PostEntity,
  attempt: AttemptRef,
  result: PublishResult,
): Promise<void> {
  return updateAttempt(prisma, post, attempt, {
    status: 'accepted',
    externalId: result.externalId,
    result: { ...result } as Prisma.InputJsonObject,
    persistedAt: new Date(),
  });
}
