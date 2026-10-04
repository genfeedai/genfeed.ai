import type { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import type { NotificationsService } from '@api/services/notifications/notifications.service';
import { SystemNotificationDeliveryError } from '@api/services/notifications/system-notification-delivery.error';
import type { SystemEventDeliveryService } from '@api/services/system-events/system-event-delivery.service';
import {
  MAX_EVENT_ATTEMPTS,
  RECOVER_BATCH_SIZE,
  SystemEventsService,
} from '@api/services/system-events/system-events.service';
import type { SystemNotificationDestinationsService } from '@api/services/system-events/system-notification-destinations.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { DEFAULT_PLATFORM_FEATURE_SETTINGS } from '@genfeedai/contracts/constants';
import type { LoggerService } from '@libs/logger/logger.service';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const notifications = {
  deliverSystemNotification: vi.fn(),
  systemNotificationStatus: vi.fn(),
};
const payload = JSON.stringify({
  version: 1,
  id: 'user.created/u1',
  type: 'user.created',
  occurredAt: '2026-09-23T12:00:00Z',
  data: { objectId: 'u1' },
});
function setup(
  enabled = true,
  enabledAt = '2026-09-23T00:00:00Z',
  isResolved = true,
) {
  const settings = {
    ...DEFAULT_PLATFORM_FEATURE_SETTINGS,
    systemEventsEnabledAt: enabled ? enabledAt : null,
  };
  const featureSettings = {
    getFeatureSettings: vi.fn(async () => settings),
    getFeatureSettingsState: vi.fn(async () => ({ isResolved, settings })),
  };
  const prisma = {
    user: { findFirst: vi.fn() },
    systemNotificationSettings: {
      findUnique: vi.fn().mockResolvedValue(null),
      upsert: vi.fn(),
    },
    $queryRaw: vi.fn().mockResolvedValue([]),
    systemEventDelivery: {
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
    systemEventWebhook: {
      upsert: vi.fn(),
      findMany: vi
        .fn()
        .mockResolvedValue([
          { id: 'user.created/u1', type: 'user.created', payload, attempts: 0 },
        ]),
      updateMany: vi.fn().mockResolvedValue({ count: 1 }),
    },
  };
  const logger = { warn: vi.fn() };
  const service = new SystemEventsService(
    {
      deliver: (...args: unknown[]) =>
        notifications.deliverSystemNotification(...args),
      retry: async () => false,
    } as unknown as SystemEventDeliveryService,
    {} as SystemNotificationDestinationsService,
    prisma as unknown as PrismaService,
    featureSettings as unknown as PlatformSettingsService,
    logger as unknown as LoggerService,
    notifications as unknown as NotificationsService,
  );
  return { service, prisma, logger };
}
describe('system event outbox', () => {
  beforeEach(() => vi.clearAllMocks());
  it('is disabled without complete operator configuration', async () => {
    const { service, prisma } = setup(false);
    await service.recover();
    await service.recordSignup('u1');
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.user.findFirst).not.toHaveBeenCalled();
  });
  it('does not backfill users before enablement and uses stable IDs for current users', async () => {
    const { service, prisma } = setup();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: null,
      createdAt: new Date('2026-09-22'),
    });
    await service.recordSignup('u1');
    expect(prisma.systemEventWebhook.upsert).not.toHaveBeenCalled();
    prisma.user.findFirst.mockResolvedValue({
      id: 'u1',
      email: null,
      createdAt: new Date('2026-09-23T12:00:00Z'),
    });
    await service.recordSignup('u1');
    expect(prisma.systemEventWebhook.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user.created/u1' }, update: {} }),
    );
  });
  it('recovers a missed signup hook from canonical users', async () => {
    const { service, prisma } = setup();
    prisma.$queryRaw.mockResolvedValue([{ id: 'u2' }]);
    prisma.user.findFirst.mockResolvedValue({
      id: 'u2',
      email: 'new@example.com',
      createdAt: new Date('2026-09-23T12:00:00Z'),
    });
    prisma.systemEventWebhook.findMany.mockResolvedValue([]);
    await service.recover();
    expect(prisma.user.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'u2', isDeleted: false } }),
    );
    expect(prisma.systemEventWebhook.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'user.created/u2' }, update: {} }),
    );
  });
  it('delivers through the existing notifications service and records acknowledgement under the lease', async () => {
    const { service, prisma } = setup();
    notifications.deliverSystemNotification.mockResolvedValue('delivered');
    await service.recover();
    expect(notifications.deliverSystemNotification).toHaveBeenCalledWith(
      expect.objectContaining({ payload }),
      expect.any(String),
    );
    expect(prisma.systemEventWebhook.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          deliveredAt: expect.any(Date),
          lastStatusCode: 200,
        }),
      }),
    );
  });
  it('honors deployment filters without dispatching externally', async () => {
    const { service, prisma } = setup();
    prisma.systemNotificationSettings.findUnique.mockResolvedValue({
      enabled: false,
      eventTypes: [],
    });
    await service.recover();
    expect(notifications.deliverSystemNotification).not.toHaveBeenCalled();
    expect(prisma.systemEventWebhook.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ skippedAt: expect.any(Date) }),
      }),
    );
  });
  it('reschedules failed delivery and does not send when another worker owns the lease', async () => {
    const { service, prisma } = setup();
    notifications.deliverSystemNotification.mockRejectedValue(
      new Error('service unavailable'),
    );
    await service.recover();
    expect(prisma.systemEventWebhook.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          nextAttemptAt: expect.any(Date),
          leaseToken: null,
        }),
      }),
    );
    notifications.deliverSystemNotification.mockClear();
    prisma.systemEventWebhook.updateMany.mockResolvedValue({ count: 0 });
    await service.recover();
    expect(notifications.deliverSystemNotification).not.toHaveBeenCalled();
  });
  it('drains a backlog in bounded batches', async () => {
    const { service, prisma } = setup();
    await service.recover();
    expect(prisma.systemEventWebhook.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: RECOVER_BATCH_SIZE }),
    );
  });
  it('logs and stores the real provider status code on failure', async () => {
    const { service, prisma, logger } = setup();
    notifications.deliverSystemNotification.mockRejectedValue(
      new SystemNotificationDeliveryError('rejected', 503),
    );
    await service.recover();
    expect(logger.warn).toHaveBeenCalledWith(
      'System event delivery will retry',
      { eventId: 'user.created/u1', statusCode: 503 },
    );
    expect(prisma.systemEventWebhook.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastStatusCode: 503 }),
      }),
    );
  });
  it('stops retrying an event that keeps failing at the attempt cap', async () => {
    const { service, prisma, logger } = setup();
    prisma.systemEventWebhook.findMany.mockResolvedValue([
      {
        id: 'user.created/u1',
        type: 'user.created',
        payload,
        attempts: MAX_EVENT_ATTEMPTS - 1,
      },
    ]);
    notifications.deliverSystemNotification.mockRejectedValue(
      new Error('boom'),
    );
    await service.recover();
    expect(logger.warn).toHaveBeenCalledWith(
      'System event delivery failed permanently',
      expect.any(Object),
    );
    expect(prisma.systemEventWebhook.updateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          skippedAt: expect.any(Date),
          leaseToken: null,
        }),
      }),
    );
  });

  describe('while the recording switch is unresolved (#5468)', () => {
    const stripeEvent = {
      version: 1 as const,
      id: 'stripe/evt_1',
      type: 'user.created' as const,
      occurredAt: '2026-09-23T12:00:00Z',
      data: { objectId: 'u1' },
    };

    it('persists a live event instead of dropping it', async () => {
      const { service, prisma } = setup(false, undefined, false);

      await service.record(stripeEvent);

      expect(prisma.systemEventWebhook.upsert).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'stripe/evt_1' } }),
      );
    });

    it('defers delivery until the switch resolves', async () => {
      const { service, prisma } = setup(true, undefined, false);

      await service.recover();

      expect(notifications.deliverSystemNotification).not.toHaveBeenCalled();
      expect(prisma.systemEventWebhook.updateMany).not.toHaveBeenCalled();
    });

    it('skips a held event that precedes the resolved window', async () => {
      const { service, prisma } = setup(true, '2026-09-23T13:00:00Z');

      await service.recover();

      expect(notifications.deliverSystemNotification).not.toHaveBeenCalled();
      expect(prisma.systemEventWebhook.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ skippedAt: expect.any(Date) }),
        }),
      );
    });

    it('skips held events once recording resolves to disabled', async () => {
      const { service, prisma } = setup(false);

      await service.recover();

      expect(notifications.deliverSystemNotification).not.toHaveBeenCalled();
      expect(prisma.systemEventWebhook.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ skippedAt: expect.any(Date) }),
        }),
      );
    });
  });
});
