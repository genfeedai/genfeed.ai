import {
  accountFieldsFromCredential,
  type InboundMessageIngestPorts,
  ingestInboundSocialMessage,
  toXPostReplyItem,
} from '@api/collections/social-inbox/services/ingestion/inbound-message-ingestion';
import type { InboundSocialMessageInput } from '@api/collections/social-inbox/services/social-inbox.types';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';

const input: InboundSocialMessageInput = {
  body: '<p>Hello world</p>',
  conversationType: 'comment',
  createdAt: new Date('2026-10-01T10:00:00Z'),
  externalConversationId: 'thread-1',
  externalMessageId: 'external-message-1',
  externalParentId: 'parent-1',
  organizationId: 'org-1',
  platform: ' YouTube ',
  userId: 'user-1',
};

function createPorts() {
  return {
    hasWorkflowQueue: vi.fn(() => true),
    prisma: {
      socialConversation: {
        create: vi.fn().mockResolvedValue({ id: 'conversation-1' }),
        findFirst: vi.fn().mockResolvedValue({ id: 'conversation-1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      socialMessage: {
        create: vi.fn().mockResolvedValue({
          body: 'Hello world',
          conversationId: 'conversation-1',
          id: 'message-1',
          userId: 'user-1',
        }),
        findFirst: vi.fn().mockResolvedValue(null),
      },
    },
    queueCommentTrigger: vi.fn().mockResolvedValue(undefined),
    realtime: { emit: vi.fn().mockResolvedValue(undefined) },
  } satisfies InboundMessageIngestPorts;
}

describe('ingestInboundSocialMessage', () => {
  it('normalizes and sanitizes before storing, then queues before realtime', async () => {
    const ports = createPorts();
    const message = await ingestInboundSocialMessage(input, ports);

    expect(ports.prisma.socialMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        body: 'Hello world',
        conversationId: 'conversation-1',
        createdAt: input.createdAt,
        direction: 'inbound',
        messageType: 'comment',
        organizationId: 'org-1',
        platform: 'youtube',
        workflowTriggerStatus: 'pending',
      }),
    });
    expect(ports.prisma.socialConversation.findFirst).toHaveBeenCalledWith({
      where: {
        externalConversationId: 'thread-1',
        isDeleted: false,
        organizationId: 'org-1',
        platform: 'youtube',
      },
    });
    expect(ports.queueCommentTrigger).toHaveBeenCalledWith(input, message, {
      id: 'conversation-1',
    });
    expect(ports.realtime.emit).toHaveBeenCalledWith(
      'org-1',
      'conversation-1',
      'message-created',
    );
    expect(ports.queueCommentTrigger.mock.invocationCallOrder[0]).toBeLessThan(
      ports.realtime.emit.mock.invocationCallOrder[0],
    );
  });

  it('rejects empty sanitized bodies before any persistence', async () => {
    const ports = createPorts();
    await expect(
      ingestInboundSocialMessage({ ...input, body: '<p> </p>' }, ports),
    ).rejects.toThrow(BadRequestException);
    expect(ports.prisma.socialConversation.findFirst).not.toHaveBeenCalled();
  });

  it('retries a duplicate trigger without changing counters or emitting realtime', async () => {
    const ports = createPorts();
    const duplicate = { id: 'existing-message' };
    ports.prisma.socialMessage.findFirst.mockResolvedValue(duplicate);
    expect(await ingestInboundSocialMessage(input, ports)).toBe(duplicate);
    expect(ports.queueCommentTrigger).toHaveBeenCalledOnce();
    expect(ports.prisma.socialMessage.create).not.toHaveBeenCalled();
    expect(ports.prisma.socialConversation.updateMany).not.toHaveBeenCalled();
    expect(ports.realtime.emit).not.toHaveBeenCalled();
  });

  it('recovers a concurrent message create without counting the losing write', async () => {
    const ports = createPorts();
    const winner = { id: 'winning-message' };
    ports.prisma.socialMessage.create.mockRejectedValue({ code: 'P2002' });
    ports.prisma.socialMessage.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(winner);
    expect(await ingestInboundSocialMessage(input, ports)).toBe(winner);
    expect(ports.prisma.socialMessage.findFirst).toHaveBeenLastCalledWith({
      where: {
        externalMessageId: input.externalMessageId,
        isDeleted: false,
        organizationId: input.organizationId,
        platform: 'youtube',
      },
    });
    expect(ports.queueCommentTrigger).toHaveBeenCalledWith(input, winner, {
      id: 'conversation-1',
    });
    expect(ports.prisma.socialConversation.updateMany).not.toHaveBeenCalled();
    expect(ports.realtime.emit).not.toHaveBeenCalled();
  });

  it.each(['P2002', 'P2025'])(
    'preserves a %s message failure when no winner exists',
    async (code) => {
      const ports = createPorts();
      const error = Object.assign(new Error('create failed'), { code });
      ports.prisma.socialMessage.create.mockRejectedValue(error);
      await expect(ingestInboundSocialMessage(input, ports)).rejects.toBe(
        error,
      );
      expect(ports.queueCommentTrigger).not.toHaveBeenCalled();
      expect(ports.realtime.emit).not.toHaveBeenCalled();
    },
  );

  it('recovers a concurrent conversation create and ingests into the winning thread', async () => {
    const ports = createPorts();
    ports.prisma.socialConversation.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'winner' });
    ports.prisma.socialConversation.create.mockRejectedValue({ code: 'P2002' });
    await ingestInboundSocialMessage(input, ports);
    expect(ports.prisma.socialMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ conversationId: 'winner' }),
    });
    expect(ports.prisma.socialConversation.findFirst).toHaveBeenLastCalledWith({
      where: {
        externalConversationId: input.externalConversationId,
        isDeleted: false,
        organizationId: input.organizationId,
        platform: 'youtube',
      },
    });
  });

  it.each(['P2002', 'P2025'])(
    'preserves a %s conversation failure when no winner exists',
    async (code) => {
      const ports = createPorts();
      const error = Object.assign(new Error('conversation failed'), { code });
      ports.prisma.socialConversation.findFirst.mockResolvedValue(null);
      ports.prisma.socialConversation.create.mockRejectedValue(error);
      await expect(ingestInboundSocialMessage(input, ports)).rejects.toBe(
        error,
      );
      expect(ports.prisma.socialMessage.create).not.toHaveBeenCalled();
    },
  );

  it('creates a conversation with bounded metadata and the existing availability rules', async () => {
    const ports = createPorts();
    ports.prisma.socialConversation.findFirst.mockResolvedValue(null);
    await ingestInboundSocialMessage(
      {
        ...input,
        accountName: 'a'.repeat(400),
        metadata: { source: 'synthetic' },
        sourceContentTitle: 't'.repeat(600),
      },
      ports,
    );
    expect(ports.prisma.socialConversation.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        accountName: 'a'.repeat(280),
        availability: expect.objectContaining({
          canPostReply: true,
          canSendDm: false,
        }),
        lastInboundAt: input.createdAt,
        metadata: { source: 'synthetic' },
        organizationId: input.organizationId,
        sourceContentTitle: 't'.repeat(500),
        status: 'open',
        unreadCount: 0,
      }),
    });
  });

  it('increments unread state for an older message without overwriting the newer preview', async () => {
    const ports = createPorts();
    ports.prisma.socialConversation.updateMany.mockResolvedValueOnce({
      count: 0,
    });
    await ingestInboundSocialMessage(input, ports);
    expect(ports.prisma.socialConversation.updateMany).toHaveBeenNthCalledWith(
      1,
      {
        data: expect.objectContaining({ latestMessageAt: input.createdAt }),
        where: {
          id: 'conversation-1',
          isDeleted: false,
          organizationId: input.organizationId,
          OR: [
            { latestMessageAt: null },
            { latestMessageAt: { lte: input.createdAt } },
          ],
        },
      },
    );
    expect(ports.prisma.socialConversation.updateMany).toHaveBeenNthCalledWith(
      2,
      {
        data: {
          inboundSequence: { increment: 1 },
          unreadCount: { increment: 1 },
          updatedAt: expect.any(Date),
        },
        where: {
          id: 'conversation-1',
          isDeleted: false,
          organizationId: input.organizationId,
        },
      },
    );
    expect(ports.prisma.socialConversation.updateMany).toHaveBeenNthCalledWith(
      3,
      {
        data: { status: 'open', updatedAt: expect.any(Date) },
        where: {
          id: 'conversation-1',
          isDeleted: false,
          organizationId: input.organizationId,
          status: 'archived',
        },
      },
    );
  });

  it('does not mark workflow work pending when the optional queue is absent', async () => {
    const ports = createPorts();
    ports.hasWorkflowQueue.mockReturnValue(false);
    await ingestInboundSocialMessage(input, ports);
    expect(ports.prisma.socialMessage.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ workflowTriggerStatus: undefined }),
    });
  });
});

describe('inbound account and X reply mapping', () => {
  it('preserves nullish fallbacks and empty account fields', () => {
    expect(
      accountFieldsFromCredential(
        {
          externalHandle: '',
          externalName: '',
          userId: '',
          username: 'fallback',
        },
        'fallback-user',
      ),
    ).toEqual({
      accountExternalId: undefined,
      accountHandle: '',
      accountName: '',
      userId: '',
    });
    expect(
      accountFieldsFromCredential(
        { label: 'Account', username: 'handle' },
        'fallback-user',
      ),
    ).toEqual({
      accountExternalId: undefined,
      accountHandle: 'handle',
      accountName: 'Account',
      userId: 'fallback-user',
    });
  });

  it('keeps the reply target, identity and source fallbacks intact', () => {
    const item = toXPostReplyItem(
      { externalId: 'account-1', id: 'credential-1' },
      { organizationId: 'org-1', userId: 'scope-user' },
      {
        brandId: 'brand-1',
        description: 'd'.repeat(150),
        externalId: 'post-external-1',
        id: 'post-1',
        label: null,
        url: null,
      },
      {
        authorUsername: 'author',
        conversationId: 'thread-1',
        createdAt: new Date(),
        inReplyToId: 'parent-1',
        text: 'Reply',
        tweetId: 'reply-1',
      },
    );
    expect(item).toMatchObject({
      input: {
        accountExternalId: 'account-1',
        credentialId: 'credential-1',
        externalConversationId: 'thread-1',
        externalParentId: 'reply-1',
        externalParentMessageId: 'parent-1',
        organizationId: 'org-1',
        participantName: 'author',
        postId: 'post-1',
        sourceContentTitle: 'd'.repeat(120),
        sourceContentUrl: 'https://x.com/i/status/post-external-1',
        userId: 'scope-user',
      },
      messageId: 'reply-1',
      threadId: 'thread-1',
    });
  });
});
