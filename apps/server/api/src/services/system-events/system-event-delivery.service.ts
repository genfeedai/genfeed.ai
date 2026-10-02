import { randomUUID } from 'node:crypto';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { SystemNotificationDestinationsService } from '@api/services/system-events/system-notification-destinations.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { SystemEventWebhook } from '@genfeedai/prisma';
import type { SystemEvent } from '@libs/interfaces/system-event.interface';
import { Injectable } from '@nestjs/common';

@Injectable()
export class SystemEventDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly destinations: SystemNotificationDestinationsService,
    private readonly notifications: NotificationsService,
  ) {}

  /** Fanout is chosen once; retries use each destination's current configuration. */
  async deliver(
    row: SystemEventWebhook,
    eventLeaseToken: string,
  ): Promise<'delivered' | 'skipped' | Date> {
    if (!row.destinationsResolvedAt) {
      // tenant-scope-ignore: deployment-owned system event routes
      const destinations =
        await this.prisma.systemNotificationDestination.findMany({
          where: { isDeleted: false },
        });
      // Keep a fresh event pending until the operator configures a destination.
      if (!destinations.length) return new Date(Date.now() + 60000);
      const selected = destinations.filter(
        (destination) =>
          destination.isEnabled && destination.eventTypes.includes(row.type),
      );
      await this.prisma.$transaction(async (tx) => {
        // tenant-scope-ignore: only the current event lease owner may resolve routes
        const claimed = await tx.systemEventWebhook.updateMany({
          where: {
            id: row.id,
            isDeleted: false,
            leaseToken: eventLeaseToken,
            destinationsResolvedAt: null,
          },
          data: { destinationsResolvedAt: new Date() },
        });
        if (!claimed.count) return;
        // tenant-scope-ignore: atomic deployment event-to-destination fanout
        await tx.systemEventDelivery.createMany({
          data: selected.map((destination) => ({
            id: randomUUID(),
            eventId: row.id,
            destinationId: destination.id,
          })),
          skipDuplicates: true,
        });
      });
    }

    const now = new Date();
    // tenant-scope-ignore: delivery history owned by the deployment operator
    const pending = await this.prisma.systemEventDelivery.findMany({
      where: {
        eventId: row.id,
        isDeleted: false,
        deliveredAt: null,
        skippedAt: null,
      },
      include: { destination: true },
    });
    const event = JSON.parse(row.payload) as SystemEvent;
    await Promise.all(
      pending
        .filter(
          (delivery) =>
            delivery.nextAttemptAt <= now &&
            (!delivery.leaseUntil || delivery.leaseUntil <= now),
        )
        .map(async (delivery) => {
          const leaseToken = randomUUID();
          // tenant-scope-ignore: CAS delivery claim prevents concurrent provider sends
          const claimed = await this.prisma.systemEventDelivery.updateMany({
            where: {
              id: delivery.id,
              isDeleted: false,
              deliveredAt: null,
              skippedAt: null,
              nextAttemptAt: { lte: now },
              OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
            },
            data: {
              leaseToken,
              leaseUntil: new Date(Date.now() + 120000),
              attempts: { increment: 1 },
            },
          });
          if (!claimed.count) return;
          const where = { id: delivery.id, leaseToken, isDeleted: false };
          try {
            const destination = delivery.destination;
            if (
              destination.isDeleted ||
              !destination.isEnabled ||
              !destination.eventTypes.includes(row.type)
            ) {
              // tenant-scope-ignore: an explicit operator disable is never replayed
              await this.prisma.systemEventDelivery.updateMany({
                where,
                data: {
                  skippedAt: new Date(),
                  leaseToken: null,
                  leaseUntil: null,
                },
              });
              return;
            }
            await this.notifications.deliverSystemNotification(
              event,
              this.destinations.target(destination),
              `system/${delivery.id}`,
            );
            // tenant-scope-ignore: provider acceptance belongs only to this destination
            await this.prisma.systemEventDelivery.updateMany({
              where,
              data: {
                deliveredAt: new Date(),
                leaseToken: null,
                leaseUntil: null,
              },
            });
          } catch {
            // Never retain a provider error or destination URL in logs or history.
            // tenant-scope-ignore: destination failure cannot reset another destination
            await this.prisma.systemEventDelivery.updateMany({
              where,
              data: {
                nextAttemptAt: new Date(
                  Date.now() +
                    Math.min(
                      3600000,
                      30000 * 2 ** Math.min(delivery.attempts, 7),
                    ),
                ),
                leaseToken: null,
                leaseUntil: null,
              },
            });
          }
        }),
    );
    // tenant-scope-ignore: aggregate the destination states for this exact event
    const deliveries = await this.prisma.systemEventDelivery.findMany({
      where: { eventId: row.id, isDeleted: false },
    });
    const remaining = deliveries.filter(
      (delivery) => !delivery.deliveredAt && !delivery.skippedAt,
    );
    if (!remaining.length)
      return deliveries.some((delivery) => delivery.deliveredAt)
        ? 'delivered'
        : 'skipped';
    return new Date(
      Math.min(
        ...remaining.map((delivery) =>
          Math.max(
            delivery.nextAttemptAt.getTime(),
            delivery.leaseUntil?.getTime() ?? 0,
          ),
        ),
      ),
    );
  }

  async retry(id: string): Promise<boolean> {
    // tenant-scope-ignore: super-admin schedules exactly one destination delivery
    const row = await this.prisma.systemEventDelivery.findFirst({
      where: { id, isDeleted: false },
    });
    if (!row) return false;
    if (row.deliveredAt || row.skippedAt) return true;
    // tenant-scope-ignore: scheduling never overrides a worker's live lease
    await this.prisma.systemEventDelivery.updateMany({
      where: { id, isDeleted: false, deliveredAt: null, skippedAt: null },
      data: { nextAttemptAt: new Date() },
    });
    // tenant-scope-ignore: make the parent event eligible for the next sweep
    await this.prisma.systemEventWebhook.updateMany({
      where: {
        id: row.eventId,
        isDeleted: false,
        deliveredAt: null,
        skippedAt: null,
      },
      data: { nextAttemptAt: new Date() },
    });
    return true;
  }
}
