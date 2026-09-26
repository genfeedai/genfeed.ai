import {
  formatSocialReplySummary,
  SocialReplyNotificationService,
} from '@api/services/notifications/social-reply-notifications/social-reply-notification.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function setup() {
  const transaction = {
    notificationDelivery: {
      upsert: vi.fn().mockResolvedValue({ id: 'delivery-1' }),
    },
    notificationEvent: { upsert: vi.fn().mockResolvedValue({ id: 'event-1' }) },
  };
  const prisma = {
    $transaction: vi.fn(
      async (callback: (client: typeof transaction) => Promise<unknown>) =>
        callback(transaction),
    ),
    credential: {
      findFirst: vi.fn().mockResolvedValue({ userId: 'user-credential' }),
    },
    member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
    notificationInboxItem: {
      findMany: vi.fn().mockResolvedValue([]),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    notificationPreference: { findFirst: vi.fn().mockResolvedValue(null) },
    organization: {
      findFirst: vi.fn().mockResolvedValue({ userId: 'user-owner' }),
    },
    socialConversation: { findMany: vi.fn().mockResolvedValue([]) },
  };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const service = new SocialReplyNotificationService(
    prisma as never,
    logger as never,
  );
  return { logger, prisma, service, transaction };
}

const input = {
  accountHandle: '@acme',
  brandId: 'brand-1',
  credentialId: 'credential-1',
  newReplies: [
    {
      conversationId: 'conversation-a',
      externalMessageId: '1800000000000000002',
    },
    {
      conversationId: 'conversation-b',
      externalMessageId: '1800000000000000010',
    },
    { conversationId: 'conversation-a', externalMessageId: '999' },
  ],
  occurredAt: new Date('2026-09-25T12:00:00.000Z'),
  organizationId: 'org-1',
  platform: 'twitter',
};

describe('SocialReplyNotificationService', () => {
  let context: ReturnType<typeof setup>;

  beforeEach(() => {
    context = setup();
  });

  it('writes nothing when the sync run created no replies', async () => {
    await expect(
      context.service.recordNewReplies({ ...input, newReplies: [] }),
    ).resolves.toBeNull();

    expect(context.prisma.credential.findFirst).not.toHaveBeenCalled();
    expect(context.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('aggregates one run into a single event and in-app delivery', async () => {
    await expect(context.service.recordNewReplies(input)).resolves.toBe(
      'delivery-1',
    );

    const dedupKey =
      'social.reply.received/org-1/credential-1/1800000000000000010';
    expect(context.transaction.notificationEvent.upsert).toHaveBeenCalledOnce();
    expect(context.transaction.notificationEvent.upsert).toHaveBeenCalledWith({
      create: expect.objectContaining({
        deduplicationKey: dedupKey,
        eventKey: 'social.reply.received',
        organizationId: 'org-1',
        payload: expect.objectContaining({
          accountHandle: 'acme',
          brandId: 'brand-1',
          conversationIds: ['conversation-b', 'conversation-a'],
          kind: 'social_reply',
          newestConversationId: 'conversation-b',
          newestReplyId: '1800000000000000010',
          replyCount: 3,
          version: 2,
          summary: '3 new replies on @acme',
        }),
        sourceId: 'credential-1',
        sourceType: 'social_credential',
      }),
      update: {},
      where: {
        deduplicationKey: dedupKey,
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(
      context.transaction.notificationDelivery.upsert,
    ).toHaveBeenCalledWith({
      create: expect.objectContaining({
        channel: 'in_app',
        deliveredAt: input.occurredAt,
        eventId: 'event-1',
        idempotencyKey: `${dedupKey}/user-credential/in_app`,
        organizationId: 'org-1',
        status: 'delivered',
        topic: 'social.reply',
        userId: 'user-credential',
      }),
      update: {},
      where: {
        eventId_userId_channel: {
          channel: 'in_app',
          eventId: 'event-1',
          userId: 'user-credential',
        },
        isDeleted: false,
        organizationId: 'org-1',
      },
    });
    expect(context.prisma.member.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        isActive: true,
        isDeleted: false,
        organizationId: 'org-1',
        user: { is: { isDeleted: false } },
        userId: 'user-credential',
      },
    });
  });

  it('is idempotent when the same batch is recorded again', async () => {
    await context.service.recordNewReplies(input);
    await context.service.recordNewReplies({
      ...input,
      newReplies: [...input.newReplies].reverse(),
    });

    const [first, second] =
      context.transaction.notificationEvent.upsert.mock.calls;
    expect(second[0].where).toEqual(first[0].where);
    expect(second[0].update).toEqual({});
    const [firstDelivery, secondDelivery] =
      context.transaction.notificationDelivery.upsert.mock.calls;
    expect(secondDelivery[0].create.idempotencyKey).toBe(
      firstDelivery[0].create.idempotencyKey,
    );
    expect(secondDelivery[0].update).toEqual({});
  });

  it('falls back to the organization owner when the connector left', async () => {
    context.prisma.member.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'member-owner' });

    await context.service.recordNewReplies(input);

    expect(
      context.transaction.notificationDelivery.upsert.mock.calls[0][0].create
        .userId,
    ).toBe('user-owner');
  });

  it('skips when no active recipient exists', async () => {
    context.prisma.member.findFirst.mockResolvedValue(null);

    await expect(context.service.recordNewReplies(input)).resolves.toBeNull();
    expect(context.prisma.$transaction).not.toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalledOnce();
  });

  it('honours an explicit opt-out and defaults to enabled', async () => {
    context.prisma.notificationPreference.findFirst.mockResolvedValue({
      isEnabled: false,
    });
    await expect(context.service.recordNewReplies(input)).resolves.toBeNull();
    expect(
      context.prisma.notificationPreference.findFirst,
    ).toHaveBeenCalledWith({
      select: { isEnabled: true },
      where: {
        channel: 'in_app',
        isDeleted: false,
        topic: 'social.reply',
        userId: 'user-credential',
      },
    });
    expect(context.prisma.$transaction).not.toHaveBeenCalled();
  });

  describe('markConversationRepliesRead', () => {
    const readInput = {
      conversationId: 'conversation-a',
      organizationId: 'org-1',
    };

    it("reads every member's items whose every conversation is read", async () => {
      context.prisma.notificationInboxItem.findMany.mockResolvedValue([
        {
          event: { payload: { conversationIds: ['conversation-a'] } },
          id: 'i1',
        },
        {
          event: {
            payload: { conversationIds: ['conversation-a', 'conversation-b'] },
          },
          id: 'i2',
        },
      ]);
      context.prisma.socialConversation.findMany.mockResolvedValue([
        { id: 'conversation-b' },
      ]);
      context.prisma.notificationInboxItem.updateMany.mockResolvedValue({
        count: 1,
      });

      await expect(
        context.service.markConversationRepliesRead(readInput),
      ).resolves.toBe(1);

      expect(
        context.prisma.notificationInboxItem.findMany,
      ).toHaveBeenCalledWith({
        select: { event: { select: { payload: true } }, id: true },
        where: {
          event: {
            isDeleted: false,
            organizationId: 'org-1',
            payload: {
              array_contains: ['conversation-a'],
              path: ['conversationIds'],
            },
          },
          isDeleted: false,
          organizationId: 'org-1',
          readAt: null,
          topic: 'social.reply',
        },
      });
      // Not filtered by recipient: the thread's read state is shared.
      expect(
        context.prisma.notificationInboxItem.findMany.mock.calls[0][0].where,
      ).not.toHaveProperty('userId');
      expect(context.prisma.socialConversation.findMany).toHaveBeenCalledWith({
        select: { id: true },
        where: {
          id: { in: ['conversation-a', 'conversation-b'] },
          isDeleted: false,
          organizationId: 'org-1',
          unreadCount: { gt: 0 },
        },
      });
      expect(
        context.prisma.notificationInboxItem.updateMany,
      ).toHaveBeenCalledWith({
        data: { readAt: expect.any(Date) },
        where: {
          id: { in: ['i1'] },
          isDeleted: false,
          organizationId: 'org-1',
          readAt: null,
          topic: 'social.reply',
        },
      });
    });

    it('leaves an aggregated item unread while another thread is unread', async () => {
      context.prisma.notificationInboxItem.findMany.mockResolvedValue([
        {
          event: {
            payload: { conversationIds: ['conversation-a', 'conversation-b'] },
          },
          id: 'i2',
        },
      ]);
      context.prisma.socialConversation.findMany.mockResolvedValue([
        { id: 'conversation-b' },
      ]);

      await expect(
        context.service.markConversationRepliesRead(readInput),
      ).resolves.toBe(0);
      expect(
        context.prisma.notificationInboxItem.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('ignores payloads without conversation ids', async () => {
      context.prisma.notificationInboxItem.findMany.mockResolvedValue([
        { event: { payload: { kind: 'social_reply' } }, id: 'malformed' },
      ]);

      await expect(
        context.service.markConversationRepliesRead(readInput),
      ).resolves.toBe(0);
      expect(context.prisma.socialConversation.findMany).not.toHaveBeenCalled();
      expect(
        context.prisma.notificationInboxItem.updateMany,
      ).not.toHaveBeenCalled();
    });

    it('logs and swallows failures so the thread read still succeeds', async () => {
      context.prisma.notificationInboxItem.findMany.mockRejectedValue(
        new Error('db unavailable'),
      );

      await expect(
        context.service.markConversationRepliesRead(readInput),
      ).resolves.toBe(0);
      expect(context.logger.error).toHaveBeenCalledOnce();
    });
  });

  it('formats singular and handle-less summaries', () => {
    expect(formatSocialReplySummary(1, 'acme')).toBe('1 new reply on @acme');
    expect(formatSocialReplySummary(2, null)).toBe('2 new replies');
  });
});
