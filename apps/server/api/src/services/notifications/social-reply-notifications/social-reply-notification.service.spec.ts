import type { RecordActivityInput } from '@api/services/activity-recording/activity-recording.types';
import {
  formatSocialReplySummary,
  SocialReplyNotificationService,
} from '@api/services/notifications/social-reply-notifications/social-reply-notification.service';
import { ActivityKey, ActivitySource } from '@genfeedai/contracts';
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
  const transaction = { socialConversation };
  const commit = { activities: [], inbox: [], pendingDeliveryIds: [] };
  const activityRecorder = {
    afterCommit: vi.fn(),
    recordInTransaction: vi.fn(
      async (_transaction: unknown, _input: RecordActivityInput) => ({
        activity: { id: 'activity-1' },
        commit,
      }),
    ),
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
    activityRecorder as never,
    logger as never,
  );
  return { activityRecorder, commit, logger, prisma, service, transaction };
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

  it('records one run as a single activity the policy raises in the bell', async () => {
    await expect(context.service.recordNewReplies(input)).resolves.toBe(
      'activity-1',
    );

    const dedupKey =
      'social-replies-received/org-1/credential-1/1800000000000000010';
    expect(context.activityRecorder.recordInTransaction).toHaveBeenCalledOnce();
    expect(context.activityRecorder.recordInTransaction).toHaveBeenCalledWith(
      context.transaction,
      {
        alert: {
          deduplicationKey: dedupKey,
          occurredAt: input.occurredAt,
          payload: expect.objectContaining({
            accountHandle: 'acme',
            brandId: 'brand-1',
            conversationIds: ['conversation-b', 'conversation-a'],
            kind: 'social_reply',
            newestConversationId: 'conversation-b',
            newestReplyId: '1800000000000000010',
            replyCount: 3,
            summary: '3 new replies on @acme',
            version: 2,
          }),
          source: { id: 'credential-1', type: 'social_credential' },
        },
        brandId: 'brand-1',
        entityId: 'credential-1',
        entityModel: 'Credential',
        key: ActivityKey.SOCIAL_REPLIES_RECEIVED,
        organizationId: 'org-1',
        source: ActivitySource.SOCIAL_INTEGRATION,
        userId: 'user-credential',
        value: '3 new replies on @acme',
      },
    );
    expect(context.activityRecorder.afterCommit).toHaveBeenCalledWith(
      context.commit,
    );
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
      'activity-1',
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
    expect(context.activityRecorder.recordInTransaction).not.toHaveBeenCalled();
    expect(context.activityRecorder.afterCommit).not.toHaveBeenCalled();
    expect(context.prisma.socialConversation.findFirst).toHaveBeenCalledTimes(
      2,
    );
  });

  it('keys a re-run of the same batch to the same deduplication key', async () => {
    await context.service.recordNewReplies(input);
    await context.service.recordNewReplies({
      ...input,
      newReplies: [...input.newReplies].reverse(),
    });

    const [first, second] =
      context.activityRecorder.recordInTransaction.mock.calls;
    expect(second[1].alert?.deduplicationKey).toBe(
      first[1].alert?.deduplicationKey,
    );
  });

  it('falls back to the organization owner when the connector left', async () => {
    context.prisma.member.findFirst
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: 'member-owner' });

    await context.service.recordNewReplies(input);

    expect(
      context.activityRecorder.recordInTransaction.mock.calls[0][1].userId,
    ).toBe('user-owner');
  });

  it('skips when no active recipient exists', async () => {
    context.prisma.member.findFirst.mockResolvedValue(null);

    await expect(context.service.recordNewReplies(input)).resolves.toBeNull();
    expect(context.prisma.$transaction).not.toHaveBeenCalled();
    expect(context.logger.warn).toHaveBeenCalledOnce();
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
