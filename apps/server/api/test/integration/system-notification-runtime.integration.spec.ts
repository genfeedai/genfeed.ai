import { randomUUID } from 'node:crypto';
import type { NotificationsService } from '@api/services/notifications/notifications.service';
import { SystemEventDeliveryService } from '@api/services/system-events/system-event-delivery.service';
import type { SystemNotificationDestinationsService } from '@api/services/system-events/system-notification-destinations.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  PrismaClient,
  type SystemNotificationDestination,
} from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

// Explicit opt-in: never use the inherited application database for this fixture.
const databaseUrl = process.env.SYSTEM_NOTIFICATION_TEST_DATABASE_URL;
const integration = describe.skipIf(!databaseUrl);
integration('system notification PostgreSQL fanout', () => {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: databaseUrl ?? '' }),
  });
  const prefix = `runtime-test/${randomUUID()}`;
  afterAll(async () => {
    // tenant-scope-ignore: clean only rows owned by this explicit integration fixture
    await prisma.systemEventDelivery.deleteMany({
      where: { event: { id: { startsWith: prefix } } },
    });
    await prisma.systemEventWebhook.deleteMany({
      where: { id: { startsWith: prefix } },
    });
    await prisma.systemNotificationDestination.deleteMany({
      where: { label: { startsWith: prefix } },
    });
    await prisma.$disconnect();
  });
  it('atomically resolves fanout, persists independent acknowledgements, and uses edited recipients on retry', async () => {
    const destinations = await Promise.all(
      ['discord', 'email'].map((provider) =>
        prisma.systemNotificationDestination.create({
          data: {
            label: `${prefix}/${provider}`,
            provider,
            address: 'old@example.com',
            isEnabled: true,
            eventTypes: ['user.created'],
          },
        }),
      ),
    );
    const event = await prisma.systemEventWebhook.create({
      data: {
        id: `${prefix}/event`,
        type: 'user.created',
        occurredAt: new Date(),
        leaseToken: 'parent-lease',
        payload: JSON.stringify({
          version: 1,
          id: `${prefix}/event`,
          type: 'user.created',
          occurredAt: new Date().toISOString(),
          data: { objectId: 'fixture' },
        }),
      },
    });
    const send = vi.fn(async (_event, target) => {
      if (target.provider === 'email') throw new Error('retryable');
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
    );
    expect(await service.deliver(event, 'parent-lease')).toBeInstanceOf(Date);
    const resolved = await prisma.systemEventWebhook.findUniqueOrThrow({
      where: { id: event.id },
    });
    expect(resolved.destinationsResolvedAt).toBeInstanceOf(Date);
    const rows = await prisma.systemEventDelivery.findMany({
      where: { eventId: event.id },
      orderBy: { destinationId: 'asc' },
    });
    expect(rows).toHaveLength(2);
    expect(rows.filter((row) => row.deliveredAt)).toHaveLength(1);
    await prisma.systemNotificationDestination.update({
      where: { id: destinations[1].id },
      data: { address: 'new@example.com' },
    });
    const failed = rows.find((row) => !row.deliveredAt);
    expect(failed).toBeDefined();
    if (!failed) throw new Error('Missing failed delivery');
    await service.retry(failed.id);
    send.mockResolvedValue(undefined);
    expect(await service.deliver(resolved, 'parent-lease')).toBe('delivered');
    expect(send).toHaveBeenCalledTimes(3);
    expect(send).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: event.id }),
      { provider: 'email', address: 'new@example.com' },
      `system/${failed.id}`,
    );
    expect(
      await prisma.systemEventDelivery.count({
        where: { eventId: event.id, deliveredAt: { not: null } },
      }),
    ).toBe(2);
  });
});
