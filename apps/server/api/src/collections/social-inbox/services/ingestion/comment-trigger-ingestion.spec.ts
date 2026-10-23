import {
  type CommentTriggerIngestPorts,
  queueSocialCommentTrigger,
} from '@api/collections/social-inbox/services/ingestion/comment-trigger-ingestion';
import type { InboundSocialMessageInput } from '@api/collections/social-inbox/services/social-inbox.types';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const input: InboundSocialMessageInput = {
  body: 'Inbound comment',
  brandId: 'brand-1',
  conversationType: 'comment',
  credentialId: 'credential-1',
  externalConversationId: 'external-thread-1',
  externalMessageId: 'external-message-1',
  externalParentId: 'parent-1',
  organizationId: 'org-1',
  participantExternalId: 'author-1',
  participantHandle: 'author',
  platform: 'youtube',
  sourceContentId: 'source-1',
  userId: 'user-1',
};
const message = {
  body: 'Stored comment',
  id: 'message-1',
  userId: 'message-user',
};
const conversation = { id: 'conversation-1', platform: 'youtube' };
const now = new Date('2026-10-01T10:00:00Z');
type TriggerTransaction = Parameters<
  Parameters<CommentTriggerIngestPorts['prisma']['$transaction']>[0]
>[0];

function createPorts() {
  const transaction = {
    socialConversation: {
      findFirst: vi.fn().mockResolvedValue({
        automationState: 'failed',
        metadata: { unrelated: 'keep', workflowTriggerFailedAt: 'earlier' },
      }),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    socialMessage: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  } satisfies TriggerTransaction;
  return {
    prisma: {
      $transaction: vi.fn(
        async (write: (tx: TriggerTransaction) => Promise<void>) =>
          write(transaction),
      ),
      socialMessage: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    },
    queueService: {
      queueTriggerEvent: vi.fn().mockResolvedValue('queued-job-1'),
    },
    transaction,
  } satisfies CommentTriggerIngestPorts & { transaction: TriggerTransaction };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(now);
});
afterEach(() => vi.useRealTimers());

describe('queueSocialCommentTrigger', () => {
  it('leaves messages untouched without the optional queue or a user identity', async () => {
    const ports = createPorts();
    await queueSocialCommentTrigger(input, message, conversation, {
      prisma: ports.prisma,
    });
    await queueSocialCommentTrigger(
      { ...input, userId: undefined },
      { ...message, userId: null },
      conversation,
      ports,
    );
    expect(ports.prisma.socialMessage.updateMany).not.toHaveBeenCalled();
    expect(ports.queueService.queueTriggerEvent).not.toHaveBeenCalled();
  });

  it('does not enqueue when a concurrent worker already owns the claim', async () => {
    const ports = createPorts();
    ports.prisma.socialMessage.updateMany.mockResolvedValue({ count: 0 });
    await queueSocialCommentTrigger(input, message, conversation, ports);
    expect(ports.queueService.queueTriggerEvent).not.toHaveBeenCalled();
    expect(ports.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('claims only tenant-scoped retryable or stale messages and uses a stable job id', async () => {
    const ports = createPorts();
    await queueSocialCommentTrigger(input, message, conversation, ports);
    expect(ports.prisma.socialMessage.updateMany).toHaveBeenCalledWith({
      data: {
        workflowTriggerAttemptedAt: now,
        workflowTriggerError: null,
        workflowTriggerJobId: 'social-comment-trigger-org-1-message-1',
        workflowTriggerStatus: 'enqueueing',
      },
      where: {
        conversationId: conversation.id,
        id: message.id,
        isDeleted: false,
        organizationId: input.organizationId,
        OR: [
          { workflowTriggerStatus: null },
          { workflowTriggerStatus: { in: ['pending', 'failed'] } },
          {
            workflowTriggerAttemptedAt: {
              lt: new Date(now.getTime() - 5 * 60 * 1000),
            },
            workflowTriggerStatus: 'enqueueing',
          },
        ],
      },
    });
    expect(ports.queueService.queueTriggerEvent).toHaveBeenCalledWith(
      {
        data: expect.objectContaining({
          authorId: 'author-1',
          authorUsername: 'author',
          conversationId: conversation.id,
          credentialId: 'credential-1',
          messageId: message.id,
          postId: 'parent-1',
          text: 'Stored comment',
        }),
        organizationId: input.organizationId,
        platform: conversation.platform,
        type: 'commentTrigger',
        userId: 'user-1',
      },
      { jobId: 'social-comment-trigger-org-1-message-1' },
    );
  });

  it('falls back to the persisted user and external message target', async () => {
    const ports = createPorts();
    await queueSocialCommentTrigger(
      { ...input, externalParentId: undefined, userId: undefined },
      message,
      conversation,
      ports,
    );
    expect(ports.queueService.queueTriggerEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ postId: 'external-message-1' }),
        userId: 'message-user',
      }),
      expect.any(Object),
    );
  });

  it('finalizes only its own claim and clears the failed state using fresh metadata', async () => {
    const ports = createPorts();
    await queueSocialCommentTrigger(input, message, conversation, ports);
    expect(ports.transaction.socialMessage.updateMany).toHaveBeenCalledWith({
      data: {
        workflowTriggerError: null,
        workflowTriggerJobId: 'queued-job-1',
        workflowTriggerQueuedAt: now,
        workflowTriggerStatus: 'queued',
      },
      where: {
        conversationId: conversation.id,
        id: message.id,
        isDeleted: false,
        organizationId: input.organizationId,
        workflowTriggerAttemptedAt: now,
        workflowTriggerStatus: 'enqueueing',
      },
    });
    expect(ports.transaction.socialConversation.findFirst).toHaveBeenCalledWith(
      {
        where: {
          id: conversation.id,
          isDeleted: false,
          organizationId: input.organizationId,
        },
      },
    );
    expect(
      ports.transaction.socialConversation.updateMany,
    ).toHaveBeenCalledWith({
      data: {
        automationState: 'manual',
        metadata: {
          lastWorkflowTriggerJobId: 'queued-job-1',
          lastWorkflowTriggeredAt: now.toISOString(),
          unrelated: 'keep',
          workflowTriggerError: null,
          workflowTriggerFailedAt: null,
        },
      },
      where: {
        id: conversation.id,
        isDeleted: false,
        organizationId: input.organizationId,
      },
    });
  });

  it('preserves a failed state that was not caused by a trigger failure', async () => {
    const ports = createPorts();
    ports.transaction.socialConversation.findFirst.mockResolvedValue({
      automationState: 'failed',
      metadata: { unrelated: 'keep' },
    });
    await queueSocialCommentTrigger(input, message, conversation, ports);
    expect(
      ports.transaction.socialConversation.updateMany,
    ).toHaveBeenCalledWith({
      data: expect.objectContaining({ automationState: 'failed' }),
      where: expect.any(Object),
    });
  });

  it.each([new Error('queue unavailable'), 'queue unavailable'])(
    'records a queue failure and preserves unrelated metadata (%s)',
    async (error) => {
      const ports = createPorts();
      ports.queueService.queueTriggerEvent.mockRejectedValue(error);
      await queueSocialCommentTrigger(input, message, conversation, ports);
      expect(ports.transaction.socialMessage.updateMany).toHaveBeenCalledWith({
        data: {
          workflowTriggerError: 'queue unavailable',
          workflowTriggerStatus: 'failed',
        },
        where: {
          conversationId: conversation.id,
          id: message.id,
          isDeleted: false,
          organizationId: input.organizationId,
          workflowTriggerAttemptedAt: now,
          workflowTriggerStatus: 'enqueueing',
        },
      });
      expect(
        ports.transaction.socialConversation.updateMany,
      ).toHaveBeenCalledWith({
        data: {
          automationState: 'failed',
          metadata: {
            unrelated: 'keep',
            workflowTriggerError: 'queue unavailable',
            workflowTriggerFailedAt: now.toISOString(),
          },
        },
        where: {
          id: conversation.id,
          isDeleted: false,
          organizationId: input.organizationId,
        },
      });
    },
  );

  it.each([false, true])(
    'does not overwrite a newer claim during finalization (queue failure: %s)',
    async (isFailure) => {
      const ports = createPorts();
      if (isFailure)
        ports.queueService.queueTriggerEvent.mockRejectedValue(
          new Error('failed'),
        );
      ports.transaction.socialMessage.updateMany.mockResolvedValue({
        count: 0,
      });
      await queueSocialCommentTrigger(input, message, conversation, ports);
      expect(
        ports.transaction.socialConversation.findFirst,
      ).not.toHaveBeenCalled();
      expect(
        ports.transaction.socialConversation.updateMany,
      ).not.toHaveBeenCalled();
    },
  );

  it.each([false, true])(
    'does not update a deleted or missing conversation (queue failure: %s)',
    async (isFailure) => {
      const ports = createPorts();
      if (isFailure)
        ports.queueService.queueTriggerEvent.mockRejectedValue(
          new Error('failed'),
        );
      ports.transaction.socialConversation.findFirst.mockResolvedValue(null);
      await queueSocialCommentTrigger(input, message, conversation, ports);
      expect(
        ports.transaction.socialConversation.updateMany,
      ).not.toHaveBeenCalled();
    },
  );

  it('propagates transaction failures after enqueue without treating them as enqueue failures', async () => {
    const ports = createPorts();
    const error = new Error('transaction failed');
    ports.prisma.$transaction.mockRejectedValue(error);
    await expect(
      queueSocialCommentTrigger(input, message, conversation, ports),
    ).rejects.toBe(error);
    expect(ports.prisma.$transaction).toHaveBeenCalledOnce();
    expect(ports.queueService.queueTriggerEvent).toHaveBeenCalledOnce();
  });
});
