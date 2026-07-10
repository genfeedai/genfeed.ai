vi.mock('@genfeedai/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@genfeedai/config')>();

  return {
    ...actual,
    isSelfHostedDeployment: () => false,
  };
});

import { LifecycleEmailDeliveryService } from '@server/services/lifecycle-emails/lifecycle-email-delivery.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

describe('LifecycleEmailDeliveryService', () => {
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
  let notificationsService: { sendEmail: ReturnType<typeof vi.fn> };

  const user = {
    email: 'founder@example.com',
    firstName: 'Vincent',
    id: 'user_1',
    isDeleted: false,
  };

  const preference = {
    id: 'pref_1',
    marketingUnsubscribedAt: null,
    unsubscribeToken: 'unsubscribe-token',
  };

  beforeEach(() => {
    prisma = {
      lifecycleEmailDelivery: {
        findFirst: vi.fn(),
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

    notificationsService = {
      sendEmail: vi.fn().mockResolvedValue(undefined),
    };

    service = new LifecycleEmailDeliveryService(
      prisma,
      notificationsService,
      {
        get: vi.fn((key: string) => {
          if (key === 'GENFEEDAI_API_URL') return 'https://api.genfeed.ai';
          if (key === 'GENFEEDAI_APP_URL') return 'https://app.genfeed.ai';
          return undefined;
        }),
      },
      { error: vi.fn(), log: vi.fn(), warn: vi.fn() },
    );
  });

  it('sends a lifecycle email with a working unsubscribe link', async () => {
    prisma.lifecycleEmailDelivery.findFirst.mockResolvedValue({
      email: user.email,
      id: 'delivery_1',
      metadata: null,
      scheduledFor: new Date(),
      sequence: 'welcome',
      status: 'scheduled',
      step: 'welcome-day-0',
      triggerKey: 'signup:user_1',
      user,
    });

    await service.sendLifecycleEmail({
      sequence: 'welcome',
      step: 'welcome-day-0',
      triggerKey: 'signup:user_1',
      userId: 'user_1',
    });

    expect(notificationsService.sendEmail).toHaveBeenCalledWith(
      user.email,
      'Welcome to Genfeed.ai',
      expect.stringContaining(
        'https://api.genfeed.ai/lifecycle-emails/unsubscribe?token=unsubscribe-token',
      ),
    );
    expect(prisma.lifecycleEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ status: 'sent' }),
        where: { id: 'delivery_1' },
      }),
    );
  });

  it('honors unsubscribe before sending queued lifecycle emails', async () => {
    prisma.lifecycleEmailPreference.findUnique.mockResolvedValue({
      ...preference,
      marketingUnsubscribedAt: new Date('2026-07-06T00:00:00Z'),
    });
    prisma.lifecycleEmailDelivery.findFirst.mockResolvedValue({
      email: user.email,
      id: 'delivery_1',
      metadata: null,
      scheduledFor: new Date(),
      sequence: 'welcome',
      status: 'scheduled',
      step: 'welcome-day-2',
      triggerKey: 'signup:user_1',
      user,
    });

    await service.sendLifecycleEmail({
      sequence: 'welcome',
      step: 'welcome-day-2',
      triggerKey: 'signup:user_1',
      userId: 'user_1',
    });

    expect(notificationsService.sendEmail).not.toHaveBeenCalled();
    expect(prisma.lifecycleEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: 'marketing unsubscribed',
          status: 'skipped',
        }),
      }),
    );
  });

  it('skips activation nudges once the user has a public post', async () => {
    prisma.post.findFirst.mockResolvedValue({ id: 'post_1' });
    prisma.lifecycleEmailDelivery.findFirst.mockResolvedValue({
      email: user.email,
      id: 'delivery_1',
      metadata: null,
      scheduledFor: new Date(),
      sequence: 'activation-nudge',
      status: 'scheduled',
      step: 'activation-nudge',
      triggerKey: 'signup:user_1',
      user,
    });

    await service.sendLifecycleEmail({
      sequence: 'activation-nudge',
      step: 'activation-nudge',
      triggerKey: 'signup:user_1',
      userId: 'user_1',
    });

    expect(notificationsService.sendEmail).not.toHaveBeenCalled();
    expect(prisma.lifecycleEmailDelivery.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          failureReason: 'already activated',
          status: 'skipped',
        }),
      }),
    );
  });

  it('updates marketing unsubscribe state by token', async () => {
    await expect(service.unsubscribe('unsubscribe-token')).resolves.toBe(true);

    expect(prisma.lifecycleEmailPreference.update).toHaveBeenCalledWith({
      data: { marketingUnsubscribedAt: expect.any(Date) },
      where: { id: 'pref_1' },
    });
  });
});
