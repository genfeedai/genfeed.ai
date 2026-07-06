vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    IS_SELF_HOSTED: false,
  };
});

import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { LifecycleEmailService } from './lifecycle-email.service';
import { LifecycleEmailQueueService } from './lifecycle-email-queue.service';

describe('LifecycleEmailService', () => {
  let service: LifecycleEmailService;
  let prisma: {
    lifecycleEmailDelivery: {
      create: ReturnType<typeof vi.fn>;
      findFirst: ReturnType<typeof vi.fn>;
      updateMany: ReturnType<typeof vi.fn>;
    };
    user: { findFirst: ReturnType<typeof vi.fn> };
  };
  let queueService: { scheduleEmail: ReturnType<typeof vi.fn> };

  const user = {
    email: 'founder@example.com',
    firstName: 'Vincent',
    id: 'user_1',
    isDeleted: false,
  };

  beforeEach(() => {
    prisma = {
      lifecycleEmailDelivery: {
        create: vi.fn().mockResolvedValue({ id: 'delivery_1' }),
        findFirst: vi.fn().mockResolvedValue({ userId: 'user_1' }),
        updateMany: vi.fn().mockResolvedValue({ count: 1 }),
      },
      user: { findFirst: vi.fn().mockResolvedValue(user) },
    };

    queueService = {
      scheduleEmail: vi.fn().mockResolvedValue(undefined),
    };

    service = new LifecycleEmailService(
      prisma as unknown as PrismaService,
      queueService as unknown as LifecycleEmailQueueService,
      { log: vi.fn(), warn: vi.fn() } as unknown as LoggerService,
    );
  });

  it('schedules welcome and activation lifecycle steps for a new signup', async () => {
    await service.scheduleSignupLifecycle('user_1');

    expect(prisma.lifecycleEmailDelivery.create).toHaveBeenCalledTimes(4);
    expect(queueService.scheduleEmail).toHaveBeenCalledTimes(4);
    expect(
      prisma.lifecycleEmailDelivery.create.mock.calls.map(
        ([call]) => call.data.step,
      ),
    ).toEqual([
      'welcome-day-0',
      'welcome-day-2',
      'welcome-day-7',
      'activation-nudge',
    ]);
  });

  it('schedules abandoned checkout recovery with checkout metadata', async () => {
    await service.recordCheckoutStarted({
      checkoutSessionId: 'cs_1',
      checkoutUrl: 'https://checkout.stripe.com/session',
      organizationId: 'org_1',
      source: 'organization-checkout',
      userId: 'user_1',
    });

    expect(prisma.lifecycleEmailDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          metadata: {
            checkoutUrl: 'https://checkout.stripe.com/session',
            organizationId: 'org_1',
            source: 'organization-checkout',
          },
          sequence: 'abandoned-checkout',
          step: 'checkout-recovery',
          triggerKey: 'checkout:cs_1',
          userId: 'user_1',
        }),
      }),
    );
    expect(queueService.scheduleEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        checkoutSessionId: 'cs_1',
        sequence: 'abandoned-checkout',
        step: 'checkout-recovery',
      }),
      expect.any(Date),
    );
  });

  it('cancels pending abandoned checkout deliveries when checkout completes', async () => {
    await service.recordCheckoutCompleted('cs_1');

    expect(prisma.lifecycleEmailDelivery.findFirst).toHaveBeenCalledWith({
      select: { userId: true },
      where: {
        sequence: 'abandoned-checkout',
        status: { in: ['scheduled', 'failed'] },
        triggerKey: 'checkout:cs_1',
      },
    });
    expect(prisma.lifecycleEmailDelivery.updateMany).toHaveBeenCalledWith({
      data: {
        canceledAt: expect.any(Date),
        status: 'canceled',
      },
      where: {
        sequence: 'abandoned-checkout',
        status: { in: ['scheduled', 'failed'] },
        triggerKey: 'checkout:cs_1',
        userId: 'user_1',
      },
    });
  });

  it('skips checkout completion cancellation when no pending delivery exists', async () => {
    prisma.lifecycleEmailDelivery.findFirst.mockResolvedValue(null);

    await service.recordCheckoutCompleted('cs_missing');

    expect(prisma.lifecycleEmailDelivery.updateMany).not.toHaveBeenCalled();
  });
});
