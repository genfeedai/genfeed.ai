import { createHmac } from 'node:crypto';
import { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import { EmailDeliveryError } from '@api/services/notifications/notifications.service';

function fixture() {
  const message = {
    id: 'message-1',
    organizationId: 'org-1',
    userId: 'user-1',
    templateKey: 'content-weekly',
    destinationUrl: 'https://app.example.test/assets',
    recipientHash: 'recipient-hash',
    providerMessageId: 'provider-1',
  };
  const row = {
    id: 'delivery-1',
    organizationId: 'org-1',
    userId: 'user-1',
    topic: 'content.weekly',
    attemptCount: 1,
    idempotencyKey: 'key-1',
    emailMessage: message,
    event: {
      payload: {
        html: '<p>Hello</p>',
        subject: 'Weekly recap',
        lifecycleDeliveryId: 'lifecycle-1',
      },
    },
    user: { email: 'creator@example.test', isDeleted: false },
  };
  const tx = {
    notificationEvent: { upsert: vi.fn().mockResolvedValue({ id: 'event-1' }) },
    notificationDelivery: {
      findFirst: vi.fn().mockResolvedValue(row),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      upsert: vi.fn().mockResolvedValue({ id: 'delivery-1' }),
    },
    emailMessage: {
      findFirst: vi.fn().mockResolvedValue(message),
      upsert: vi.fn(),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    emailClick: {
      findFirst: vi.fn().mockResolvedValue({ messageId: 'message-1' }),
      create: vi.fn(),
    },
    emailConversion: {
      upsert: vi.fn().mockResolvedValue({ messageId: 'message-1' }),
    },
    emailSuppression: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
    emailProviderEvent: {
      findMany: vi.fn().mockResolvedValue([]),
      upsert: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    member: { findFirst: vi.fn().mockResolvedValue({ id: 'member-1' }) },
    organization: { findFirst: vi.fn().mockResolvedValue(null) },
    lifecycleEmailDelivery: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const prisma = {
    ...tx,
    $transaction: vi.fn(
      async (
        input: ((client: typeof tx) => Promise<unknown>) | Promise<unknown>[],
      ) => (typeof input === 'function' ? input(tx) : Promise.all(input)),
    ),
  };
  const notifications = {
    deliverEmail: vi.fn().mockResolvedValue('provider-1'),
  };
  const queue = { enqueue: vi.fn().mockResolvedValue(undefined) };
  const preferences = {
    findForUser: vi.fn().mockResolvedValue({ isEnabled: true }),
  };
  const eligibility = { shouldSend: vi.fn().mockResolvedValue(true) };
  const secret = `whsec_${Buffer.from('test-secret-only').toString('base64')}`;
  const config = {
    get: vi.fn(
      (key: string) =>
        (
          ({
            GENFEEDAI_APP_URL: 'https://app.example.test',
            GENFEEDAI_API_URL: 'https://api.example.test',
            RESEND_WEBHOOK_SECRET: secret,
          }) as Record<string, string>
        )[key],
    ),
  };
  const logger = { warn: vi.fn() };
  const service = new EmailPerformanceService(
    prisma as never,
    notifications as never,
    queue as never,
    preferences as never,
    eligibility as never,
    config as never,
    logger as never,
  );
  return {
    service,
    prisma,
    notifications,
    queue,
    preferences,
    eligibility,
    logger,
    row,
    message,
    secret,
  };
}

describe('EmailPerformanceService durable delivery', () => {
  it('persists a pending email before queueing, substitutes an opaque CTA and survives Redis outage', async () => {
    const f = fixture();
    f.queue.enqueue.mockRejectedValue(new Error('Redis offline'));
    await expect(
      f.service.queueEmail({
        userId: 'user-1',
        organizationId: 'org-1',
        topic: 'content.weekly',
        templateKey: 'content-weekly',
        subject: 'Recap',
        html: '<a href="{{emailActionUrl}}">View</a>',
        destinationUrl: 'https://app.example.test/assets',
        idempotencyKey: 'week-1',
      }),
    ).resolves.toBe('delivery-1');
    const event = f.prisma.notificationEvent.upsert.mock.calls[0][0].create;
    expect(event.payload.html).toMatch(
      /https:\/\/api\.example\.test\/v1\/email-performance\/click\/[A-Za-z0-9_-]{43}/,
    );
    expect(event.payload.html).not.toContain('user-1');
    expect(
      f.prisma.notificationDelivery.upsert.mock.calls[0][0].create,
    ).not.toHaveProperty('deliveredAt');
    expect(f.notifications.deliverEmail).not.toHaveBeenCalled();
    expect(f.queue.enqueue.mock.invocationCallOrder[0]).toBeGreaterThan(
      f.prisma.emailMessage.upsert.mock.invocationCallOrder[0],
    );
  });

  it('records provider acceptance only after the provider acknowledges and updates legacy lifecycle state', async () => {
    const f = fixture();
    f.notifications.deliverEmail.mockImplementation(async () => {
      expect(f.prisma.notificationDelivery.updateMany).not.toHaveBeenCalled();
      return 'provider-1';
    });
    await f.service.deliverClaimed('delivery-1');
    expect(f.prisma.emailMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { acceptedAt: expect.any(Date), providerMessageId: 'provider-1' },
      }),
    );
    expect(f.prisma.emailMessage.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ deliveredAt: expect.any(Date) }),
      }),
    );
    expect(f.prisma.lifecycleEmailDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent' }),
      }),
    );
  });

  it.each(['disabled', 'suppressed', 'ineligible', 'removed-member'])(
    'skips %s recipients before contacting provider',
    async (reason) => {
      const f = fixture();
      if (reason === 'disabled')
        f.preferences.findForUser.mockResolvedValue({ isEnabled: false });
      if (reason === 'suppressed')
        f.prisma.emailSuppression.findUnique.mockResolvedValue({
          reason: 'email.complained',
        } as never);
      if (reason === 'ineligible')
        f.eligibility.shouldSend.mockResolvedValue(false);
      if (reason === 'removed-member')
        f.prisma.member.findFirst.mockResolvedValue(null as never);
      await f.service.deliverClaimed('delivery-1');
      expect(f.notifications.deliverEmail).not.toHaveBeenCalled();
      expect(f.prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ status: 'skipped' }),
        }),
      );
    },
  );

  it('retries transient provider failures without storing recipient-bearing errors', async () => {
    const f = fixture();
    f.notifications.deliverEmail.mockRejectedValue(
      new Error('Rejected creator@example.test token=secret'),
    );
    await f.service.deliverClaimed('delivery-1');
    expect(f.prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'retry_pending',
          lastError: 'email_delivery_retry',
        }),
      }),
    );
    expect(JSON.stringify(f.logger.warn.mock.calls)).not.toContain(
      'creator@example.test',
    );
    expect(f.prisma.lifecycleEmailDelivery.updateMany).not.toHaveBeenCalled();
  });

  it('ends permanent provider failures without marking accepted', async () => {
    const f = fixture();
    f.notifications.deliverEmail.mockRejectedValue(
      new EmailDeliveryError(false, 422),
    );
    await f.service.deliverClaimed('delivery-1');
    expect(f.prisma.notificationDelivery.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'failed' }),
      }),
    );
  });
});

describe('EmailPerformanceService attribution', () => {
  it('retains each CTA visit so later clicks cannot erase an earlier qualifying click', async () => {
    const f = fixture();
    await f.service.trackClick('a'.repeat(43));
    await f.service.trackClick('a'.repeat(43));
    expect(f.prisma.emailClick.create).toHaveBeenCalledTimes(2);
    expect(f.prisma.emailClick.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          messageId: 'message-1',
          organizationId: 'org-1',
          userId: 'user-1',
        }),
      }),
    );
  });

  it('uses only historical first-party CTA visits before the confirmed action within the same org, user and goal', async () => {
    const f = fixture();
    const occurredAt = new Date('2026-09-08T12:00:00Z');
    await expect(
      f.service.recordConversion({
        organizationId: 'org-1',
        userId: 'user-1',
        goal: 'publish_content',
        sourceId: 'post-1',
        occurredAt,
      }),
    ).resolves.toBe('message-1');
    expect(f.prisma.emailClick.findFirst).toHaveBeenCalledWith({
      where: {
        organizationId: 'org-1',
        userId: 'user-1',
        isDeleted: false,
        occurredAt: { gte: new Date('2026-09-01T12:00:00Z'), lte: occurredAt },
        message: {
          organizationId: 'org-1',
          userId: 'user-1',
          goal: 'publish_content',
          isDeleted: false,
          acceptedAt: { not: null },
        },
      },
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      select: { messageId: true },
    });
    expect(f.prisma.emailConversion.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: {},
        where: {
          organizationId_userId_goal_sourceId: {
            organizationId: 'org-1',
            userId: 'user-1',
            goal: 'publish_content',
            sourceId: 'post-1',
          },
        },
      }),
    );
  });

  it('does not attribute a provider click or an action without a qualifying CTA', async () => {
    const f = fixture();
    f.prisma.emailClick.findFirst.mockResolvedValue(null as never);
    await expect(
      f.service.recordConversion({
        organizationId: 'org-1',
        userId: 'user-1',
        goal: 'buy_credits',
        sourceId: 'purchase-1',
      }),
    ).resolves.toBeNull();
    expect(f.prisma.emailConversion.upsert).not.toHaveBeenCalled();
  });

  it('rejects token redirects that were tampered with in storage', async () => {
    const f = fixture();
    f.message.destinationUrl = 'https://evil.test';
    await expect(f.service.trackClick('a'.repeat(43))).rejects.toThrow();
    expect(f.prisma.emailClick.create).not.toHaveBeenCalled();
  });
});

describe('EmailPerformanceService provider receipts', () => {
  it('persists a verified receipt before reconciliation and deduplicates on provider event ID', async () => {
    const f = fixture();
    const timestamp = String(Math.floor(Date.now() / 1000));
    const body = Buffer.from(
      JSON.stringify({
        type: 'email.delivered',
        created_at: new Date().toISOString(),
        data: { email_id: 'provider-1', to: ['private@example.test'] },
      }),
    );
    const signature = `v1,${createHmac('sha256', Buffer.from('test-secret-only')).update(`event-1.${timestamp}.`).update(body).digest('base64')}`;
    await f.service.receiveWebhook(body, {
      id: 'event-1',
      timestamp,
      signature,
    });
    expect(f.prisma.emailProviderEvent.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'event-1' },
        update: {},
        create: expect.objectContaining({
          providerMessageId: 'provider-1',
          eventType: 'email.delivered',
        }),
      }),
    );
    expect(
      JSON.stringify(f.prisma.emailProviderEvent.upsert.mock.calls),
    ).not.toContain('private@example.test');
  });

  it('suppresses a bounced recipient and reconciles out-of-order evidence without creating CTA visits', async () => {
    const f = fixture();
    const occurredAt = new Date();
    f.prisma.emailProviderEvent.findMany.mockResolvedValue([
      { id: 'event-1', eventType: 'email.bounced', occurredAt },
    ] as never);
    await f.service.reconcileProviderEvents('provider-1');
    expect(f.prisma.emailSuppression.upsert).toHaveBeenCalledWith({
      where: { recipientHash: 'recipient-hash' },
      update: { reason: 'email.bounced' },
      create: { recipientHash: 'recipient-hash', reason: 'email.bounced' },
    });
    expect(f.prisma.emailClick.create).not.toHaveBeenCalled();
    expect(f.prisma.emailMessage.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          OR: [{ bouncedAt: null }, { bouncedAt: { gt: occurredAt } }],
        }),
      }),
    );
  });

  it('rejects forged webhook requests before writing any provider event', async () => {
    const f = fixture();
    await expect(
      f.service.receiveWebhook(Buffer.from('{}'), {
        id: 'forged',
        timestamp: String(Date.now() / 1000),
        signature: 'v1,forged',
      }),
    ).rejects.toThrow();
    expect(f.prisma.emailProviderEvent.upsert).not.toHaveBeenCalled();
  });
});
