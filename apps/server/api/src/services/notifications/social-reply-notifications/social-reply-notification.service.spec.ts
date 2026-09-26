import {
  formatSocialReplySummary,
  SocialReplyNotificationService,
} from '@api/services/notifications/social-reply-notifications/social-reply-notification.service';
import { Prisma } from '@genfeedai/prisma';
import { beforeEach, describe, expect, it, vi } from 'vitest';

function setup() {
  // Shared by `prisma.socialConversation` and `transaction.socialConversation`
  // (the everyConversationIsRead check runs against whichever client is
  // passed to it — the plain client for the fast-path check outside the
  // transaction, the transaction client for the authoritative check inside
  // it) so a test only has to configure one mock to drive both call sites.
  const socialConversation = {
    // Defaults to "at least one covered thread is still unread" so every
    // existing recordNewReplies test keeps creating a notification; tests
    // for the skip path override this to an empty result.
    findFirst: vi.fn().mockResolvedValue({ id: 'conversation-a' }),
    findMany: vi.fn().mockResolvedValue([]),
  };
  const transaction = {
    notificationDelivery: {
      upsert: vi.fn().mockResolvedValue({ id: 'delivery-1' }),
    },
    notificationEvent: { upsert: vi.fn().mockResolvedValue({ id: 'event-1' }) },
    socialConversation,
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
    socialConversation,
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

  it('skips creating a notification when every covered thread is already read', async () => {
    context.prisma.socialConversation.findFirst.mockResolvedValue(null);

    await expect(context.service.recordNewReplies(input)).resolves.toBeNull();

    expect(context.prisma.socialConversation.findFirst).toHaveBeenCalledWith({
      select: { id: true },
      where: {
        // Newest reply first: conversation-b's reply sorts ahead of both of
        // conversation-a's, so it is first into the deduplicated id set.
        id: { in: ['conversation-b', 'conversation-a'] },
        isDeleted: false,
        organizationId: 'org-1',
        unreadCount: { gt: 0 },
      },
    });
    // A stuck bell item is worse than a missed one: nothing marks it read
    // once every thread it covers is already read, so the run never even
    // resolves a recipient or checks preferences for it.
    expect(context.prisma.credential.findFirst).not.toHaveBeenCalled();
    expect(context.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('still notifies when only some covered threads are already read', async () => {
    context.prisma.socialConversation.findFirst.mockResolvedValue({
      id: 'conversation-b',
    });

    await expect(context.service.recordNewReplies(input)).resolves.toBe(
      'delivery-1',
    );
    expect(context.prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('re-checks inside the write transaction, closing the gap a read between the fast-path check and the write could open', async () => {
    // The fast-path check (outside the transaction) sees a still-unread
    // thread; by the time the transaction runs its own check, a concurrent
    // read has cleared it. The authoritative, in-transaction check must
    // catch this and skip the write — the fast-path check alone cannot.
    context.prisma.socialConversation.findFirst
      .mockResolvedValueOnce({ id: 'conversation-a' })
      .mockResolvedValueOnce(null);

    await expect(context.service.recordNewReplies(input)).resolves.toBeNull();

    expect(context.prisma.$transaction).toHaveBeenCalledOnce();
    expect(context.transaction.notificationEvent.upsert).not.toHaveBeenCalled();
    expect(
      context.transaction.notificationDelivery.upsert,
    ).not.toHaveBeenCalled();
    expect(context.prisma.socialConversation.findFirst).toHaveBeenCalledTimes(
      2,
    );
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

    it("never reads or clears another organization's inbox items", async () => {
      // Two orgs happen to reference the same conversation id (ids are not
      // globally unique across tenants). Each org's own item must be the
      // only one read and the only one cleared for its own call.
      const items = [
        {
          event: { payload: { conversationIds: ['conversation-a'] } },
          id: 'org1-item',
          organizationId: 'org-1',
        },
        {
          event: { payload: { conversationIds: ['conversation-a'] } },
          id: 'org2-item',
          organizationId: 'org-2',
        },
      ];
      context.prisma.notificationInboxItem.findMany.mockImplementation(
        ({ where }: { where: { organizationId: string } }) =>
          Promise.resolve(
            items.filter(
              (item) => item.organizationId === where.organizationId,
            ),
          ),
      );
      context.prisma.socialConversation.findMany.mockResolvedValue([]);
      context.prisma.notificationInboxItem.updateMany.mockImplementation(
        ({
          where,
        }: {
          where: { id: { in: string[] }; organizationId: string };
        }) =>
          Promise.resolve({
            count: items.filter(
              (item) =>
                item.organizationId === where.organizationId &&
                where.id.in.includes(item.id),
            ).length,
          }),
      );

      await expect(
        context.service.markConversationRepliesRead(readInput),
      ).resolves.toBe(1);

      expect(
        context.prisma.notificationInboxItem.updateMany,
      ).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['org1-item'] },
            organizationId: 'org-1',
          }),
        }),
      );

      await expect(
        context.service.markConversationRepliesRead({
          conversationId: 'conversation-a',
          organizationId: 'org-2',
        }),
      ).resolves.toBe(1);

      expect(
        context.prisma.notificationInboxItem.updateMany,
      ).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: ['org2-item'] },
            organizationId: 'org-2',
          }),
        }),
      );
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

    it('never swallows a broken query shape as a silent no-op', async () => {
      // A PrismaClientValidationError means the `array_contains`/`path`
      // filter (or any other argument shape here) is invalid — a code bug,
      // not the transient failure this method's catch exists to absorb.
      // Swallowing it would make every read look like "already read"
      // forever, with nothing in the test suite or the logs to tell the
      // two apart.
      context.prisma.notificationInboxItem.findMany.mockRejectedValue(
        new Prisma.PrismaClientValidationError('Unknown argument `path`', {
          clientVersion: 'test',
        }),
      );

      await expect(
        context.service.markConversationRepliesRead(readInput),
      ).rejects.toBeInstanceOf(Prisma.PrismaClientValidationError);
      expect(context.logger.error).not.toHaveBeenCalled();
    });
  });

  it('formats singular and handle-less summaries', () => {
    expect(formatSocialReplySummary(1, 'acme')).toBe('1 new reply on @acme');
    expect(formatSocialReplySummary(2, null)).toBe('2 new replies');
  });
});
