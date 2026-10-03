import type { PostEntity } from '@api/collections/posts/entities/post.entity';
import type { PublishResult } from '@api/index';
import { TargetExecutionState } from '@genfeedai/contracts';
import type { Prisma } from '@genfeedai/prisma';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { readPostString } from '@workers/services/scheduled-post.utils';
import { readScheduledDeliveryResult } from '@workers/services/scheduled-post-delivery-input.util';

type ReceiptClient = Pick<PrismaService, 'postProviderPublishReceipt'>;

export type ProviderPublishReceipt = {
  id: string;
  result: PublishResult;
};

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

function receiptScope(post: PostEntity): {
  organizationId: string;
  postId: string;
} | null {
  const organizationId = readPostString(post, ['organizationId']);
  const postId = post.id ? String(post.id) : '';
  return organizationId && postId ? { organizationId, postId } : null;
}

function readReceiptResult(value: Prisma.JsonValue): PublishResult | null {
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

/**
 * Pending receipt for the post's current publish attempt. A receipt whose
 * external id the post already carries was persisted; it is retired so a later
 * recurrence publishes normally.
 */
export async function findReplayableProviderReceipt(
  prisma: ReceiptClient,
  post: PostEntity,
): Promise<ProviderPublishReceipt | null> {
  const scope = receiptScope(post);
  if (!scope) return null;
  const receipt = await prisma.postProviderPublishReceipt.findFirst({
    where: { ...scope, persistedAt: null, isDeleted: false },
    orderBy: { createdAt: 'desc' },
    select: { id: true, externalId: true, result: true },
  });
  if (!receipt) return null;
  const result = readReceiptResult(receipt.result);
  const postExternalId = readPostString(post, ['externalId']);
  if (
    !result ||
    (receipt.externalId && receipt.externalId === postExternalId)
  ) {
    await markProviderReceiptPersisted(prisma, post, receipt.id);
    return null;
  }
  return { id: receipt.id, result };
}

export async function recordProviderReceipt(
  prisma: ReceiptClient,
  post: PostEntity,
  workflowExecutionId: string,
  result: PublishResult,
): Promise<string | null> {
  const scope = receiptScope(post);
  if (!scope) return null;
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
      externalId: result.externalId,
      result: { ...result } as Prisma.InputJsonObject,
    },
    update: {},
    select: { id: true },
  });
  return receipt.id;
}

export async function markProviderReceiptPersisted(
  prisma: ReceiptClient,
  post: PostEntity,
  receiptId: string,
): Promise<void> {
  const scope = receiptScope(post);
  if (!scope) return;
  await prisma.postProviderPublishReceipt.updateMany({
    where: {
      id: receiptId,
      organizationId: scope.organizationId,
      postId: scope.postId,
      isDeleted: false,
    },
    data: { persistedAt: new Date() },
  });
}
