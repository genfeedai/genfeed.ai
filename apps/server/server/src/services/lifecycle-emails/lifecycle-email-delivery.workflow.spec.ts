vi.mock('@genfeedai/config', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@genfeedai/config')>()),
  isSelfHostedDeployment: () => false,
}));

import type {
  ServerConfig,
  ServerLogger,
  ServerNotifications,
  ServerPrisma,
} from '@server/server.dependencies';
import { LifecycleEmailDeliveryService } from '@server/services/lifecycle-emails/lifecycle-email-delivery.service';
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
    metadata: null,
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
    };
    lifecycleEmailPreference: {
      create: ReturnType<typeof vi.fn>;
      findUnique: ReturnType<typeof vi.fn>;
      update: ReturnType<typeof vi.fn>;
    };
    post: { findFirst: ReturnType<typeof vi.fn> };
    subscription: { findFirst: ReturnType<typeof vi.fn> };
    userSubscription: { findFirst: ReturnType<typeof vi.fn> };
  };
  let sendEmail: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    prisma = {
      lifecycleEmailDelivery: {
        findFirst: vi.fn().mockResolvedValue(delivery),
        update: vi.fn().mockResolvedValue(undefined),
      },
      lifecycleEmailPreference: {
        create: vi.fn().mockResolvedValue(preference),
        findUnique: vi.fn().mockResolvedValue(preference),
        update: vi.fn().mockResolvedValue(undefined),
      },
      post: { findFirst: vi.fn().mockResolvedValue(null) },
      subscription: { findFirst: vi.fn().mockResolvedValue(null) },
      userSubscription: { findFirst: vi.fn().mockResolvedValue(null) },
    };
    sendEmail = vi.fn().mockResolvedValue(undefined);
    service = new LifecycleEmailDeliveryService(
      prisma as unknown as ServerPrisma,
      { sendEmail } as unknown as ServerNotifications,
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
    );
  });

  it('loads, checks, renders, delivers, and finalizes one email', async () => {
    const loaded = await service.loadLifecycleDelivery(request);
    const checked = await service.checkLifecycleEligibility(loaded);
    const rendered = service.renderLifecycleDelivery(checked);
    const delivered = await service.deliverLifecycleEmail(rendered);

    await expect(service.finalizeLifecycleDelivery(delivered)).resolves.toEqual(
      { delivered: true },
    );
    expect(sendEmail).toHaveBeenCalledWith(
      delivery.email,
      'Welcome to Genfeed.ai',
      expect.stringContaining('unsubscribe-token'),
    );
    expect(prisma.lifecycleEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent' }),
        where: { id: delivery.id },
      }),
    );
  });

  it('marks a failed workflow finalizer idempotently from the loaded state', async () => {
    const loaded = await service.loadLifecycleDelivery(request);
    await expect(
      service.finalizeLifecycleDelivery(loaded, 'provider unavailable'),
    ).resolves.toEqual({ delivered: false });
    expect(prisma.lifecycleEmailDelivery.update).toHaveBeenCalledWith({
      data: { failureReason: 'provider unavailable', status: 'failed' },
      where: { id: delivery.id },
    });
  });

  it('preserves unsubscribe behavior outside delivery execution', async () => {
    await expect(service.unsubscribe('unsubscribe-token')).resolves.toBe(true);
    expect(prisma.lifecycleEmailPreference.update).toHaveBeenCalledWith({
      data: { marketingUnsubscribedAt: expect.any(Date) },
      where: { id: preference.id },
    });
  });
});
