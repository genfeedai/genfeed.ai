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
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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
          failedAt: expect.any(Date),
          leaseToken: null,
        }),
      }),
    );
    expect(prisma.systemEventWebhook.updateMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ skippedAt: expect.any(Date) }),
      }),
    );
  });

  describe('a capped event (#6110)', () => {
    afterEach(() => notifications.deliverSystemNotification.mockReset());
    type EventRow = {
      id: string;
      type: string;
      payload: string;
      occurredAt: Date;
      attempts: number;
      nextAttemptAt: Date;
      deliveredAt: Date | null;
      skippedAt: Date | null;
      failedAt: Date | null;
      leaseToken: string | null;
      leaseUntil: Date | null;
      isDeleted: boolean;
    };
    type DeliveryRow = {
      id: string;
      eventId: string;
      destinationId: string;
      attempts: number;
      nextAttemptAt: Date;
      deliveredAt: Date | null;
      skippedAt: Date | null;
      failedAt: Date | null;
      leaseToken: string | null;
      leaseUntil: Date | null;
      isDeleted: boolean;
    };
    type Args = {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    const matches = (
      row: Record<string, unknown>,
      where: Record<string, unknown>,
    ) =>
      Object.entries(where).every(([key, want]) => {
        if (key === 'OR' || key === 'deliveries') return true;
        if (want === null) return row[key] === null;
        if (typeof want === 'object' && want !== null && 'not' in want)
          return row[key] !== null;
        if (typeof want === 'object' && want !== null && 'lte' in want)
          return (row[key] as Date) <= (want as { lte: Date }).lte;
        return row[key] === want;
      });
    function harness() {
      const { service, prisma } = setup();
      const event: EventRow = {
        id: 'user.created/u1',
        type: 'user.created',
        payload,
        occurredAt: new Date('2026-09-23T12:00:00Z'),
        attempts: MAX_EVENT_ATTEMPTS - 1,
        nextAttemptAt: new Date(0),
        deliveredAt: null,
        skippedAt: null,
        failedAt: null,
        leaseToken: null,
        leaseUntil: null,
        isDeleted: false,
      };
      const delivery: DeliveryRow = {
        id: 'delivery-1',
        eventId: event.id,
        destinationId: 'dest-1',
        attempts: 3,
        nextAttemptAt: new Date(Date.now() + 3_600_000),
        deliveredAt: null,
        skippedAt: null,
        failedAt: null,
        leaseToken: 'stale',
        leaseUntil: new Date(Date.now() + 60_000),
        isDeleted: false,
      };
      const state = { failProcessing: true, failTransaction: false };
      const webhook = prisma.systemEventWebhook;
      webhook.findMany.mockImplementation(
        async ({ where }: { where: Record<string, unknown> }) =>
          matches(event, where) ? [structuredClone(event)] : [],
      );
      webhook.findFirst.mockImplementation(
        async ({ where }: { where: Record<string, unknown> }) =>
          matches(event, where) ? structuredClone(event) : null,
      );
      webhook.updateMany.mockImplementation(async ({ where, data }: Args) => {
        if (!matches(event, where)) return { count: 0 };
        Object.assign(
          event,
          data,
          typeof data.attempts === 'object'
            ? { attempts: event.attempts + 1 }
            : {},
        );
        return { count: 1 };
      });
      prisma.systemEventDelivery.updateMany.mockImplementation(
        async ({ where, data }: Args) => {
          if (!matches(delivery, where)) return { count: 0 };
          Object.assign(delivery, data);
          return { count: 1 };
        },
      );
      prisma.$transaction.mockImplementation(
        async (run: (tx: unknown) => Promise<unknown>) => {
          const before = [structuredClone(event), structuredClone(delivery)];
          try {
            return await run({
              systemEventWebhook: {
                updateMany: webhook.updateMany,
              },
              systemEventDelivery: {
                updateMany: async (args: Args) => {
                  if (state.failTransaction) throw new Error('db down');
                  return prisma.systemEventDelivery.updateMany(args);
                },
              },
            });
          } catch (error) {
            Object.assign(event, before[0]);
            Object.assign(delivery, before[1]);
            throw error;
          }
        },
      );
      return { service, prisma, event, delivery, state };
    }

    it('fails (not skipped), shows in the overview, and a retry delivers', async () => {
      const { service, event, delivery, state } = harness();
      notifications.deliverSystemNotification.mockImplementation(async () => {
        if (state.failProcessing) throw new Error('boom');
        return 'delivered';
      });
      notifications.systemNotificationStatus.mockResolvedValue({
        transportConfigured: true,
      });
      Object.assign(service, {
        destinations: { list: async () => [] },
      });

      await service.recover();
      expect(event.failedAt).toBeInstanceOf(Date);
      expect(event.skippedAt).toBeNull();
      expect(event.leaseToken).toBeNull();

      const overview = await service.overview();
      expect(overview.deliveries).toEqual([
        expect.objectContaining({
          id: event.id,
          destinationId: null,
          status: 'failed',
        }),
      ]);

      // A failed event is never swept again until an operator retries it.
      notifications.deliverSystemNotification.mockClear();
      await service.recover();
      expect(notifications.deliverSystemNotification).not.toHaveBeenCalled();

      state.failProcessing = false;
      await service.retry(event.id);
      expect(event.failedAt).toBeNull();
      expect(event.attempts).toBe(0);
      expect(event.leaseToken).toBeNull();
      expect(delivery.attempts).toBe(0);
      expect(delivery.leaseToken).toBeNull();
      expect(delivery.leaseUntil).toBeNull();
      expect(delivery.nextAttemptAt.getTime()).toBeLessThanOrEqual(Date.now());

      await service.recover();
      expect(notifications.deliverSystemNotification).toHaveBeenCalledTimes(1);
      expect(event.deliveredAt).toBeInstanceOf(Date);
    });

    it('shows a capped parent even when every destination already acknowledged', async () => {
      const { service, prisma, event } = harness();
      event.failedAt = new Date();
      notifications.systemNotificationStatus.mockResolvedValue({
        transportConfigured: true,
      });
      Object.assign(service, { destinations: { list: async () => [] } });
      prisma.systemEventDelivery.findMany.mockResolvedValue([
        {
          id: 'delivery-1',
          eventId: event.id,
          destinationId: 'dest-1',
          event,
          attempts: 1,
          deliveredAt: new Date(),
          skippedAt: null,
          failedAt: null,
          leaseUntil: null,
        },
      ]);
      const overview = await service.overview();
      expect(overview.deliveries).toEqual([
        expect.objectContaining({ id: event.id, status: 'failed' }),
        expect.objectContaining({ id: 'delivery-1', status: 'delivered' }),
      ]);
    });

    it('stays failed when resetting the pending deliveries throws', async () => {
      const { service, prisma, event, delivery, state } = harness();
      event.failedAt = new Date();
      event.attempts = MAX_EVENT_ATTEMPTS;
      state.failTransaction = true;

      await expect(service.retry(event.id)).rejects.toThrow('db down');
      expect(prisma.$transaction).toHaveBeenCalled();
      expect(event.failedAt).toBeInstanceOf(Date);
      expect(event.attempts).toBe(MAX_EVENT_ATTEMPTS);
      expect(delivery.attempts).toBe(3);

      state.failTransaction = false;
      await service.retry(event.id);
      expect(event.failedAt).toBeNull();
      expect(delivery.attempts).toBe(0);
    });
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
