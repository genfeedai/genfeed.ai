import { randomUUID } from 'node:crypto';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { systemNotificationStatusCode } from '@api/services/notifications/system-notification-delivery.error';
import { SystemNotificationDestinationsService } from '@api/services/system-events/system-notification-destinations.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import type { SystemEventWebhook } from '@genfeedai/prisma';
import type { SystemEvent } from '@libs/interfaces/system-event.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { Injectable } from '@nestjs/common';

/** A destination delivery that keeps failing becomes terminal (`failedAt`) at this many attempts. */
export const MAX_DELIVERY_ATTEMPTS = 8;
/** Poll interval for an event held while no destination is configured. */
export const NO_DESTINATION_RETRY_MS = 3_600_000;
/** Older events are never fanned out or held: a late burst of stale notifications is dropped. */
export const MAX_EVENT_AGE_MS = 86_400_000;

@Injectable()
export class SystemEventDeliveryService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly destinations: SystemNotificationDestinationsService,
    private readonly notifications: NotificationsService,
    private readonly logger: LoggerService,
  ) {}

  private async resolveDestinations(
    row: SystemEventWebhook,
    eventLeaseToken: string,
  ): Promise<Date | 'skipped' | null> {
    if (!row.destinationsResolvedAt) {
      if (Date.now() - row.occurredAt.getTime() > MAX_EVENT_AGE_MS)
        return 'skipped';
      // tenant-scope-ignore: deployment-owned system event routes
      const destinations =
        await this.prisma.systemNotificationDestination.findMany({
          where: { isDeleted: false },
        });
      // Keep a fresh event pending until the operator configures a destination,
      // polling slowly; it is dropped once it is older than MAX_EVENT_AGE_MS.
      if (!destinations.length)
        return new Date(Date.now() + NO_DESTINATION_RETRY_MS);
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

    return null;
  }

  /** Fanout is chosen once; retries use each destination's current configuration. */
  async deliver(
    row: SystemEventWebhook,
    eventLeaseToken: string,
  ): Promise<'delivered' | 'skipped' | Date> {
    const retryAt = await this.resolveDestinations(row, eventLeaseToken);
    if (retryAt === 'skipped') return 'skipped';
    if (retryAt) return retryAt;

    const now = new Date();
    // tenant-scope-ignore: delivery history owned by the deployment operator
    const pending = await this.prisma.systemEventDelivery.findMany({
      where: {
        eventId: row.id,
        isDeleted: false,
        deliveredAt: null,
        skippedAt: null,
        failedAt: null,
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
              failedAt: null,
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
          try {
            const destination = delivery.destination;
            if (
              destination.isDeleted ||
              !destination.isEnabled ||
              !destination.eventTypes.includes(row.type)
            ) {
              // tenant-scope-ignore: an explicit operator disable is never replayed
              await this.prisma.systemEventDelivery.updateMany({
                where: { id: delivery.id, leaseToken, isDeleted: false },
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
              where: { id: delivery.id, leaseToken, isDeleted: false },
              data: {
                deliveredAt: new Date(),
                leaseToken: null,
                leaseUntil: null,
              },
            });
          } catch (error) {
            // Never retain a provider error or destination URL in logs or history;
            // the HTTP status code alone is safe to keep.
            const statusCode = systemNotificationStatusCode(error);
            const isExhausted = delivery.attempts + 1 >= MAX_DELIVERY_ATTEMPTS;
            this.logger.warn(
              isExhausted
                ? 'System event delivery failed permanently'
                : 'System event delivery will retry',
              {
                attempts: delivery.attempts + 1,
                deliveryId: delivery.id,
                eventId: row.id,
                statusCode,
              },
            );
            // tenant-scope-ignore: only the event lease owner records the last provider status
            await this.prisma.systemEventWebhook.updateMany({
              where: {
                id: row.id,
                leaseToken: eventLeaseToken,
                isDeleted: false,
              },
              data: { lastStatusCode: statusCode },
            });
            // tenant-scope-ignore: destination failure cannot reset another destination
            await this.prisma.systemEventDelivery.updateMany({
              where: { id: delivery.id, leaseToken, isDeleted: false },
              data: isExhausted
                ? { failedAt: new Date(), leaseToken: null, leaseUntil: null }
                : {
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
      (delivery) =>
        !delivery.deliveredAt && !delivery.skippedAt && !delivery.failedAt,
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
    if (row.failedAt) {
      // Reopen the parent and revive the delivery together: a failure between
      // them must never strand a delivery whose parent stays terminal.
      await this.prisma.$transaction(async (tx) => {
        // tenant-scope-ignore: reopen the parent of one super-admin-selected delivery
        await tx.systemEventWebhook.updateMany({
          where: { id: row.eventId, isDeleted: false },
          // Keeps the other destinations' acknowledgements, so they are not
          // re-sent. Clearing the lease token fences a worker that already
          // computed a terminal outcome: its token-conditional write now misses.
          data: {
            nextAttemptAt: new Date(),
            deliveredAt: null,
            skippedAt: null,
            failedAt: null,
            attempts: 0,
            leaseToken: null,
            leaseUntil: null,
          },
        });
        // tenant-scope-ignore: revive a delivery that hit the attempt cap
        await tx.systemEventDelivery.updateMany({
          where: { id, isDeleted: false, deliveredAt: null, skippedAt: null },
          data: { nextAttemptAt: new Date(), attempts: 0, failedAt: null },
        });
      });
      return true;
    }
    await this.prisma.$transaction(async (tx) => {
      // tenant-scope-ignore: scheduling never overrides a worker's live lease
      await tx.systemEventDelivery.updateMany({
        where: { id, isDeleted: false, deliveredAt: null, skippedAt: null },
        data: { nextAttemptAt: new Date() },
      });
      // tenant-scope-ignore: reopen a capped parent so its pending delivery can run again
      await tx.systemEventWebhook.updateMany({
        where: {
          id: row.eventId,
          isDeleted: false,
          deliveredAt: null,
          skippedAt: null,
          failedAt: { not: null },
        },
        data: {
          failedAt: null,
          attempts: 0,
          nextAttemptAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
        },
      });
      // tenant-scope-ignore: make the parent event eligible for the next sweep
      await tx.systemEventWebhook.updateMany({
        where: {
          id: row.eventId,
          isDeleted: false,
          deliveredAt: null,
          skippedAt: null,
          failedAt: null,
        },
        data: { nextAttemptAt: new Date() },
      });
    });
    return true;
  }
}
