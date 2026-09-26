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
    notificationPreference: { findFirst: vi.fn().mockResolvedValue(null) },
    organization: {
      findFirst: vi.fn().mockResolvedValue({ userId: 'user-owner' }),
    },
  };
  const logger = { warn: vi.fn() };
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
  newReplyExternalIds: ['1800000000000000002', '1800000000000000010', '999'],
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
      context.service.recordNewReplies({ ...input, newReplyExternalIds: [] }),
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
          kind: 'social_reply',
          newestReplyId: '1800000000000000010',
          replyCount: 3,
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
      newReplyExternalIds: [...input.newReplyExternalIds].reverse(),
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

  it('formats singular and handle-less summaries', () => {
    expect(formatSocialReplySummary(1, 'acme')).toBe('1 new reply on @acme');
    expect(formatSocialReplySummary(2, null)).toBe('2 new replies');
  });
});
