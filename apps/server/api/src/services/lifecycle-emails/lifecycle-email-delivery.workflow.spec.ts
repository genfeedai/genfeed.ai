import type { EmailPerformanceService } from '@api/services/email-performance/email-performance.service';
import type { SystemEmailEligibilityService } from './system-email-eligibility.service';

vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isSelfHostedDeployment: () => false,
}));

import type {
  ServerConfig,
  ServerLogger,
  ServerPrisma,
} from '@api/server.dependencies';
import { LifecycleEmailDeliveryService } from '@api/services/lifecycle-emails/lifecycle-email-delivery.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('LifecycleEmailDeliveryService workflow actions', () => {
  const request = {
    sequence: 'welcome' as const,
    step: 'welcome-day-0' as const,
    triggerKey: 'signup-user-1',
    userId: 'user-1',
  };
  const preference = {
    id: 'preference-1',
    marketingUnsubscribedAt: null,
    unsubscribeToken: 'unsubscribe-token',
  };
  const delivery = {
    email: 'owner@example.com',
    id: 'delivery-1',
    metadata: { organizationId: 'org-1' },
    scheduledFor: new Date('2026-08-28T00:00:00Z'),
    sequence: request.sequence,
    status: 'scheduled',
    step: request.step,
    triggerKey: request.triggerKey,
    user: {
      email: 'owner@example.com',
      firstName: 'Vincent',
      id: request.userId,
      isDeleted: false,
    },
  };
  let service: LifecycleEmailDeliveryService;
  let prisma: {
    lifecycleEmailDelivery: {
      findFirst: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    lifecycleEmailPreference: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    organization: { findFirst: ReturnType<typeof vi.fn> };
    post: { findFirst: ReturnType<typeof vi.fn> };
    subscription: { findFirst: ReturnType<typeof vi.fn> };
    userSubscription: { findFirst: ReturnType<typeof vi.fn> };
  };
  let queueEmail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = {
      lifecycleEmailDelivery: {
        findFirst: vi.fn().mockResolvedValue(delivery),
        update: vi.fn().mockResolvedValue(undefined),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      lifecycleEmailPreference: {
        create: vi.fn().mockResolvedValue(preference),
        findUnique: vi.fn().mockResolvedValue(preference),
        update: vi.fn().mockResolvedValue(undefined),
      },
      organization: {
        findFirst: vi.fn().mockResolvedValue({ slug: 'studio' }),
      },
      post: { findFirst: vi.fn().mockResolvedValue(null) },
      subscription: { findFirst: vi.fn().mockResolvedValue(null) },
      userSubscription: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    queueEmail = vi.fn().mockResolvedValue('email-message-1');
    service = new LifecycleEmailDeliveryService(
      prisma as unknown as ServerPrisma,
      { queueEmail } as unknown as EmailPerformanceService,
      {
        get: vi.fn((key: string) =>
          key === 'GENFEEDAI_API_URL'
            ? 'https://api.genfeed.ai'
            : 'https://app.genfeed.ai',
        ),
      } as unknown as ServerConfig,
      {
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      } as unknown as ServerLogger,
      {
        shouldSend: vi.fn().mockResolvedValue(true),
      } as unknown as SystemEmailEligibilityService,
    );
  });

  it('loads, checks, renders, delivers, and finalizes one email', async () => {
    const loaded = await service.loadLifecycleDelivery(request);
    expect(loaded.delivery?.scheduledFor).toBe('2026-08-28T00:00:00.000Z');
    const checked = await service.checkLifecycleEligibility(loaded);
    expect(checked.preference?.marketingUnsubscribedAt).toBeNull();
    const rendered = service.renderLifecycleDelivery(checked);
    const delivered = await service.deliverLifecycleEmail(rendered);

    await expect(service.finalizeLifecycleDelivery(delivered)).resolves.toEqual(
      { delivered: false, queued: true },
    );
    expect(queueEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'user-1',
        organizationId: 'org-1',
        topic: 'lifecycle.onboarding',
        subject: 'Welcome to Genfeed.ai',
        lifecycleDeliveryId: delivery.id,
        html: expect.stringContaining('{{emailActionUrl}}'),
      }),
    );
    // Only a still-scheduled row may become queued. The job is enqueued before
    // this write, so a worker that already recorded a terminal failure must not
    // be flipped back to a terminal 'queued' with its reason cleared.
    expect(prisma.lifecycleEmailDelivery.updateMany).toHaveBeenCalledWith({
      data: { failureReason: null, status: 'queued' },
      where: { id: delivery.id, status: 'scheduled' },
    });
  });

  it('marks a failed workflow finalizer idempotently from the loaded state', async () => {
    const loaded = await service.loadLifecycleDelivery(request);
    await expect(
      service.finalizeLifecycleDelivery(loaded, 'provider unavailable'),
    ).resolves.toEqual({ delivered: false });
    expect(prisma.lifecycleEmailDelivery.updateMany).toHaveBeenCalledWith({
      data: { failureReason: 'provider unavailable', status: 'failed' },
      where: { id: delivery.id, status: { in: ['scheduled', 'failed'] } },
    });
  });

  it('preserves unsubscribe behavior outside delivery execution', async () => {
    await expect(service.unsubscribe('unsubscribe-token')).resolves.toBe(true);
    expect(prisma.lifecycleEmailPreference.update).toHaveBeenCalledWith({
      data: { marketingUnsubscribedAt: expect.any(Date) },
      where: { id: preference.id },
    });
  });

  it('omits absent optional fields from missing-delivery action outputs', async () => {
    prisma.lifecycleEmailDelivery.findFirst.mockResolvedValueOnce(null);

    const loaded = await service.loadLifecycleDelivery(request);
    const finalized = await service.finalizeLifecycleDelivery(loaded);

    expect(Object.hasOwn(loaded, 'delivery')).toBe(false);
    expect(Object.hasOwn(finalized, 'skipped')).toBe(false);
    expect(finalized).toEqual({ delivered: false });
  });

  it.each(['sent', 'queued', 'canceled', 'skipped'])(
    'leaves the delivery row untouched on a %s replay',
    async (status) => {
      prisma.lifecycleEmailDelivery.findFirst.mockResolvedValueOnce({
        ...delivery,
        failureReason: 'marketing unsubscribed',
        skippedAt: new Date('2026-08-20T00:00:00Z'),
        status,
      });

      const loaded = await service.loadLifecycleDelivery(request);
      const checked = await service.checkLifecycleEligibility(loaded);
      const finalized = await service.finalizeLifecycleDelivery(checked);

      expect(finalized.delivered).toBe(false);
      expect(prisma.lifecycleEmailDelivery.update).not.toHaveBeenCalled();
    },
  );

  it('persists the specific reason and skippedAt on a first-time skip', async () => {
    prisma.lifecycleEmailPreference.findUnique.mockResolvedValueOnce({
      ...preference,
      marketingUnsubscribedAt: new Date('2026-08-01T00:00:00Z'),
    });

    const loaded = await service.loadLifecycleDelivery(request);
    const checked = await service.checkLifecycleEligibility(loaded);
    expect(checked.skipReason).toBe('marketing unsubscribed');

    const finalized = await service.finalizeLifecycleDelivery(checked);

    expect(finalized).toEqual({
      delivered: false,
      skipped: 'marketing unsubscribed',
    });
    expect(prisma.lifecycleEmailDelivery.update).toHaveBeenCalledWith({
      data: {
        failureReason: 'marketing unsubscribed',
        skippedAt: expect.any(Date),
        status: 'skipped',
      },
      where: { id: delivery.id },
    });
  });

  it('does not overwrite failureReason or skippedAt when a skipped delivery replays', async () => {
    prisma.lifecycleEmailDelivery.findFirst.mockResolvedValueOnce({
      ...delivery,
      failureReason: 'marketing unsubscribed',
      skippedAt: new Date('2026-08-20T00:00:00Z'),
      status: 'skipped',
    });

    const loaded = await service.loadLifecycleDelivery(request);
    const checked = await service.checkLifecycleEligibility(loaded);
    expect(checked.skipReason).toBe('skipped');

    const finalized = await service.finalizeLifecycleDelivery(checked);

    expect(finalized).toEqual({ delivered: false, skipped: 'skipped' });
    expect(prisma.lifecycleEmailDelivery.update).not.toHaveBeenCalled();
  });
});
