import type { NotificationsService } from '@api/services/notifications/notifications.service';
import { SystemNotificationDeliveryError } from '@api/services/notifications/system-notification-delivery.error';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type {
  SystemEventDelivery,
  SystemEventWebhook,
  SystemNotificationDestination,
} from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import { describe, expect, it, vi } from 'vitest';
import {
  MAX_DELIVERY_ATTEMPTS,
  MAX_EVENT_AGE_MS,
  NO_DESTINATION_RETRY_MS,
  SystemEventDeliveryService,
} from './system-event-delivery.service';
import type { SystemNotificationDestinationsService } from './system-notification-destinations.service';

function setup() {
  const event = {
    id: 'user.created/u1',
    type: 'user.created',
    payload: JSON.stringify({
      version: 1,
      id: 'user.created/u1',
      type: 'user.created',
      occurredAt: new Date().toISOString(),
      data: { objectId: 'u1' },
    }),
    destinationsResolvedAt: new Date(),
    occurredAt: new Date(),
  } as SystemEventWebhook;
  const destinations = ['discord', 'email'].map(
    (provider, i) =>
      ({
        id: `dest-${i}`,
        provider,
        address: `${i}@example.com`,
        isEnabled: true,
        isDeleted: false,
        eventTypes: ['user.created'],
      }) as SystemNotificationDestination,
  );
  const deliveries = destinations.map(
    (destination, i) =>
      ({
        id: `delivery-${i}`,
        eventId: event.id,
        destinationId: destination.id,
        attempts: 0,
        nextAttemptAt: new Date(0),
        deliveredAt: null,
        skippedAt: null,
        failedAt: null,
        leaseUntil: null,
        leaseToken: null,
        isDeleted: false,
        destination,
      }) as SystemEventDelivery & {
        destination: SystemNotificationDestination;
      },
  );
  const prisma = {
    systemNotificationDestination: {
      findMany: vi.fn(async () => destinations),
    },
    systemEventWebhook: { updateMany: vi.fn(async () => ({ count: 1 })) },
    systemEventDelivery: {
      findMany: vi.fn(async ({ where }) =>
        deliveries.filter(
          (d) =>
            where.deliveredAt === undefined || (!d.deliveredAt && !d.skippedAt),
        ),
      ),
      updateMany: vi.fn(async ({ where, data }) => {
        const row = deliveries.find((delivery) => delivery.id === where.id);
        if (
          !row ||
          (where.leaseToken && row.leaseToken !== where.leaseToken) ||
          (where.OR &&
            (row.deliveredAt ||
              row.skippedAt ||
              (row.leaseUntil && row.leaseUntil > new Date())))
        )
          return { count: 0 };
        Object.assign(
          row,
          data,
          data.attempts ? { attempts: row.attempts + 1 } : {},
        );
        return { count: 1 };
      }),
    },
  };
  const logger = { warn: vi.fn() };
  const send = vi.fn(async (_event, target) => {
    if (target.provider === 'email') throw new Error('provider failed');
  });
  const service = new SystemEventDeliveryService(
    prisma as unknown as PrismaService,
    {
      target: (destination: SystemNotificationDestination) => ({
        provider: destination.provider,
        address: destination.address,
      }),
    } as unknown as SystemNotificationDestinationsService,
    { deliverSystemNotification: send } as unknown as NotificationsService,
    logger as unknown as LoggerService,
  );
  return { service, send, event, deliveries, destinations, prisma, logger };
}

describe('independent system notification delivery', () => {
  it('retries only the failed destination and reads its changed address', async () => {
    const { service, send, event, deliveries, destinations } = setup();
    expect(await service.deliver(event, 'event-lease')).toBeInstanceOf(Date);
    expect(deliveries[0].deliveredAt).toBeInstanceOf(Date);
    expect(deliveries[1].deliveredAt).toBeNull();
    destinations[1].address = 'new@example.com';
    deliveries[1].nextAttemptAt = new Date(0);
    send.mockResolvedValue(undefined);
    expect(await service.deliver(event, 'event-lease')).toBe('delivered');
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: event.id }),
      { provider: 'email', address: 'new@example.com' },
      'system/delivery-1',
    );
  });
  it('does not dispatch through a live lease or resend accepted deliveries', async () => {
    const { service, send, event, deliveries } = setup();
    deliveries[0].deliveredAt = new Date();
    deliveries[1].leaseUntil = new Date(Date.now() + 60000);
    expect(await service.deliver(event, 'event-lease')).toBeInstanceOf(Date);
    expect(send).not.toHaveBeenCalled();
  });
  it('skips disabled or removed destinations even on retry', async () => {
    const { service, send, event, destinations, deliveries } = setup();
    destinations[0].isEnabled = false;
    destinations[1].isDeleted = true;
    expect(await service.deliver(event, 'event-lease')).toBe('skipped');
    expect(deliveries.every((delivery) => delivery.skippedAt)).toBe(true);
    expect(send).not.toHaveBeenCalled();
  });
  it('holds events with no configured destinations', async () => {
    const { service, send, event, prisma } = setup();
    event.destinationsResolvedAt = null;
    prisma.systemNotificationDestination.findMany.mockResolvedValue([]);
    const retryAt = await service.deliver(event, 'event-lease');
    expect(retryAt).toBeInstanceOf(Date);
    expect(send).not.toHaveBeenCalled();
    // A held event polls slowly instead of being re-leased every minute.
    expect((retryAt as Date).getTime() - Date.now()).toBeGreaterThan(
      NO_DESTINATION_RETRY_MS - 5000,
    );
  });
  it('drops a stale event instead of flushing it once a destination exists', async () => {
    const { service, send, event, prisma } = setup();
    event.destinationsResolvedAt = null;
    event.occurredAt = new Date(Date.now() - MAX_EVENT_AGE_MS - 1000);
    expect(await service.deliver(event, 'event-lease')).toBe('skipped');
    expect(send).not.toHaveBeenCalled();
    expect(
      prisma.systemNotificationDestination.findMany,
    ).not.toHaveBeenCalled();
  });
  it('drops a stale event that was held with no destination', async () => {
    const { service, event, prisma } = setup();
    event.destinationsResolvedAt = null;
    event.occurredAt = new Date(Date.now() - MAX_EVENT_AGE_MS - 1000);
    prisma.systemNotificationDestination.findMany.mockResolvedValue([]);
    expect(await service.deliver(event, 'event-lease')).toBe('skipped');
  });
  it('marks a delivery failed at the attempt cap and stops retrying it', async () => {
    const { service, send, event, deliveries } = setup();
    deliveries[0].deliveredAt = new Date();
    deliveries[1].attempts = MAX_DELIVERY_ATTEMPTS - 1;
    expect(await service.deliver(event, 'event-lease')).toBe('delivered');
    expect(deliveries[1].failedAt).toBeInstanceOf(Date);
    expect(deliveries[1].leaseToken).toBeNull();
    send.mockClear();
    deliveries[1].nextAttemptAt = new Date(0);
    await service.deliver(event, 'event-lease');
    expect(send).not.toHaveBeenCalled();
  });
  it('keeps retrying below the cap without marking failed', async () => {
    const { service, event, deliveries } = setup();
    deliveries[0].deliveredAt = new Date();
    expect(await service.deliver(event, 'event-lease')).toBeInstanceOf(Date);
    expect(deliveries[1].failedAt).toBeNull();
  });
  it('records the real HTTP status of a failed delivery', async () => {
    const { service, send, event, deliveries, prisma, logger } = setup();
    deliveries[0].deliveredAt = new Date();
    send.mockRejectedValue(
      new SystemNotificationDeliveryError('rejected', 502),
    );
    await service.deliver(event, 'event-lease');
    expect(prisma.systemEventWebhook.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastStatusCode: 502 } }),
    );
    expect(logger.warn).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ statusCode: 502, eventId: event.id }),
    );
  });
});
