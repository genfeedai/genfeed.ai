import { randomUUID } from 'node:crypto';
import { PlatformSettingsService } from '@api/collections/platform-settings/services/platform-settings.service';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import { systemNotificationStatusCode } from '@api/services/notifications/system-notification-delivery.error';
import type {
  SystemEvent,
  SystemEventRecording,
} from '@api/services/system-events/system-event.types';
import { SystemEventDeliveryService } from '@api/services/system-events/system-event-delivery.service';
import { projectStripeSystemEvent } from '@api/services/system-events/system-event-projection';
import { SystemNotificationDestinationsService } from '@api/services/system-events/system-notification-destinations.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { SYSTEM_EVENT_TYPES } from '@libs/interfaces/system-event.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import type Stripe from 'stripe';

/** Bounds one sweep so a backlog drains over several sweeps instead of at once. */
export const RECOVER_BATCH_SIZE = 20;
/**
 * An event whose own processing keeps throwing (for example an unparseable
 * payload) stops after this many leases. Above the slow no-destination poll
 * (one lease an hour for MAX_EVENT_AGE_MS) so holding never exhausts it.
 */
export const MAX_EVENT_ATTEMPTS = 32;

@Injectable()
export class SystemEventsService {
  constructor(
    private readonly destinationDelivery: SystemEventDeliveryService,
    private readonly destinations: SystemNotificationDestinationsService,
    private readonly prisma: PrismaService,
    private readonly featureSettings: PlatformSettingsService,
    private readonly logger: LoggerService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * The recording window: `systemEventsEnabledAt` on the platform settings
   * (#5407). Unset means disabled; events that occurred before it are never
   * delivered, so turning recording on never replays historical signups.
   * Before this process has ever read the settings (#5468) recording is
   * `unresolved`: events are held, never dropped, and delivery judges them
   * once the window is known — a billing webhook arrives once and must not
   * be lost to a database blip at boot.
   */
  private async recording(): Promise<SystemEventRecording> {
    const { isResolved, settings } =
      await this.featureSettings.getFeatureSettingsState();
    if (!isResolved) {
      return { state: 'unresolved' };
    }
    return settings.systemEventsEnabledAt
      ? { since: new Date(settings.systemEventsEnabledAt), state: 'enabled' }
      : { state: 'disabled' };
  }

  async settings() {
    // tenant-scope-ignore: deployment-wide operator settings
    const row = await this.prisma.systemNotificationSettings.findUnique({
      where: { id: 'default' },
    });
    return {
      enabled: row?.enabled ?? true,
      eventTypes: row?.eventTypes ?? [...SYSTEM_EVENT_TYPES],
    };
  }

  async overview() {
    const [
      settings,
      transport,
      rows,
      failedEvents,
      observedSignups,
      first,
      destinations,
    ] = await Promise.all([
      this.settings(),
      this.notifications.systemNotificationStatus().catch(() => ({
        transportConfigured: false,
      })),
      // tenant-scope-ignore: super-admin delivery history; payloads excluded from the response
      this.prisma.systemEventDelivery.findMany({
        include: { event: true },
        where: { isDeleted: false },
        orderBy: { createdAt: 'desc' },
        take: 50,
      }),
      // tenant-scope-ignore: super-admin view of events that failed before any destination fanout
      this.prisma.systemEventWebhook.findMany({
        where: {
          isDeleted: false,
          failedAt: { not: null },
          deliveries: { none: { isDeleted: false } },
        },
        orderBy: { failedAt: 'desc' },
        take: 50,
      }),
      // tenant-scope-ignore: deployment-wide signup observation count
      this.prisma.systemEventWebhook.count({
        where: { type: 'user.created', isDeleted: false },
      }),
      // tenant-scope-ignore: deployment-wide signup observation window
      this.prisma.systemEventWebhook.findFirst({
        where: { type: 'user.created', isDeleted: false },
        orderBy: { occurredAt: 'asc' },
        select: { occurredAt: true },
      }),
      this.destinations.list(),
    ]);
    return {
      id: 'system-notifications',
      destinations,
      configuration: {
        ...settings,
        ...transport,
        recordingEnabled: (await this.recording()).state === 'enabled',
      },
      observedSignups,
      signupObservationStart: first?.occurredAt.toISOString() ?? null,
      deliveries: [
        ...failedEvents.map((event) => ({
          id: event.id,
          eventId: event.id,
          destinationId: null,
          type: event.type,
          occurredAt: event.occurredAt.toISOString(),
          status: 'failed',
          attempts: event.attempts,
          deliveredAt: null,
        })),
        ...rows.map((row) => ({
          id: row.id,
          eventId: row.eventId,
          destinationId: row.destinationId,
          type: row.event.type,
          occurredAt: row.event.occurredAt.toISOString(),
          // A capped parent strands its pending deliveries, so they read as failed.
          status: row.deliveredAt
            ? 'delivered'
            : row.failedAt || (row.event.failedAt && !row.skippedAt)
              ? 'failed'
              : row.skippedAt
                ? 'skipped'
                : row.leaseUntil && row.leaseUntil > new Date()
                  ? 'sending'
                  : row.attempts > 0
                    ? 'failed'
                    : 'pending',
          attempts: row.attempts,
          deliveredAt: row.deliveredAt?.toISOString() ?? null,
        })),
      ],
    };
  }

  async configure(input: unknown): Promise<void> {
    if (
      !input ||
      typeof input !== 'object' ||
      !('enabled' in input) ||
      typeof input.enabled !== 'boolean' ||
      !('eventTypes' in input) ||
      !Array.isArray(input.eventTypes) ||
      !input.eventTypes.every((type) => SYSTEM_EVENT_TYPES.includes(type))
    )
      throw new BadRequestException('Select valid notification events');
    const data = {
      enabled: input.enabled,
      eventTypes: [...new Set<string>(input.eventTypes)],
    };
    // tenant-scope-ignore: super-admin deployment settings
    await this.prisma.systemNotificationSettings.upsert({
      where: { id: 'default' },
      create: { id: 'default', ...data },
      update: data,
    });
  }

  async retry(id: string): Promise<void> {
    if (await this.destinationDelivery.retry(id)) return;
    // tenant-scope-ignore: super-admin retries a single non-deleted event
    const row = await this.prisma.systemEventWebhook.findFirst({
      where: { id, isDeleted: false },
    });
    if (!row) throw new NotFoundException('Notification not found');
    if (row.deliveredAt || row.skippedAt) return;
    if (row.failedAt) {
      await this.reopenFailedEvent(id);
      return;
    }
    // tenant-scope-ignore: scheduling never bypasses another worker's lease
    await this.prisma.systemEventWebhook.updateMany({
      where: {
        id,
        isDeleted: false,
        deliveredAt: null,
        skippedAt: null,
        failedAt: null,
      },
      data: { nextAttemptAt: new Date() },
    });
  }

  /**
   * Reopens a capped event and its stranded pending deliveries in one
   * transaction. Clearing the lease token fences a worker still holding the
   * old lease: its token-conditional terminal write now misses.
   */
  private async reopenFailedEvent(id: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      // tenant-scope-ignore: reopen one super-admin-selected capped event
      const reopened = await tx.systemEventWebhook.updateMany({
        where: {
          id,
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
      if (!reopened.count) return;
      // tenant-scope-ignore: reset the pending deliveries of the reopened event
      await tx.systemEventDelivery.updateMany({
        where: {
          eventId: id,
          isDeleted: false,
          deliveredAt: null,
          skippedAt: null,
          failedAt: null,
        },
        data: {
          attempts: 0,
          nextAttemptAt: new Date(),
          leaseToken: null,
          leaseUntil: null,
        },
      });
    });
  }

  async recordStripeEvent(event: Stripe.Event): Promise<void> {
    const payload = projectStripeSystemEvent(event);
    if (payload) await this.record(payload);
  }

  async recordSignup(userId: string): Promise<void> {
    if ((await this.recording()).state === 'disabled') return;
    const user = await this.prisma.user.findFirst({
      where: { id: userId, isDeleted: false },
      select: { id: true, email: true, createdAt: true },
    });
    if (user)
      await this.record({
        version: 1,
        id: `user.created/${user.id}`,
        type: 'user.created',
        occurredAt: user.createdAt.toISOString(),
        data: { objectId: user.id, email: user.email ?? undefined },
      });
  }

  async record(event: SystemEvent): Promise<void> {
    const recording = await this.recording();
    if (
      recording.state === 'disabled' ||
      (recording.state === 'enabled' &&
        new Date(event.occurredAt) < recording.since)
    )
      return;
    // tenant-scope-ignore: deployment-wide operator outbox, never exposed to tenant APIs
    await this.prisma.systemEventWebhook.upsert({
      where: { id: event.id },
      update: {},
      create: {
        id: event.id,
        type: event.type,
        payload: JSON.stringify(event),
        occurredAt: new Date(event.occurredAt),
      },
    });
  }

  async recover(): Promise<void> {
    const recording = await this.recording();
    // Held events wait for a real answer; nothing is delivered or skipped on a guess.
    if (recording.state === 'unresolved') return;
    if (recording.state === 'enabled') {
      // Recover signup hook persistence failures without replaying pre-enablement accounts.
      // tenant-scope-ignore: deployment-wide system event recovery restricted to the configured observation window
      const users = await this.prisma.$queryRaw<Array<{ id: string }>>`
        SELECT u.id FROM users u
        WHERE u."isDeleted" = false AND u."createdAt" >= ${recording.since}
          AND NOT EXISTS (SELECT 1 FROM system_event_webhooks e WHERE e.id = 'user.created/' || u.id)
        ORDER BY u."createdAt" ASC LIMIT 100
      `;
      for (const user of users) await this.recordSignup(user.id);
    }
    const now = new Date();
    // tenant-scope-ignore: deployment-wide operator delivery worker
    const due = await this.prisma.systemEventWebhook.findMany({
      where: {
        isDeleted: false,
        deliveredAt: null,
        skippedAt: null,
        failedAt: null,
        nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: RECOVER_BATCH_SIZE,
    });
    await Promise.all(
      due.map(async (row) => {
        const leaseToken = randomUUID();
        // tenant-scope-ignore: compare-and-set claim on a deployment-wide delivery ID
        const claimed = await this.prisma.systemEventWebhook.updateMany({
          where: {
            id: row.id,
            isDeleted: false,
            deliveredAt: null,
            skippedAt: null,
            failedAt: null,
            OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
          },
          data: {
            leaseToken,
            leaseUntil: new Date(Date.now() + 120_000),
            attempts: { increment: 1 },
          },
        });
        if (!claimed.count) return;
        try {
          const settings = await this.settings();
          const event = JSON.parse(row.payload) as SystemEvent;
          const isOutsideWindow =
            recording.state === 'disabled' ||
            new Date(event.occurredAt) < recording.since;
          if (
            isOutsideWindow ||
            !settings.enabled ||
            !settings.eventTypes.includes(row.type)
          ) {
            // tenant-scope-ignore: resolve pending destination history when the operator disables delivery
            await this.prisma.systemEventDelivery.updateMany({
              where: {
                eventId: row.id,
                isDeleted: false,
                deliveredAt: null,
                skippedAt: null,
              },
              data: {
                skippedAt: new Date(),
                leaseToken: null,
                leaseUntil: null,
              },
            });
            // tenant-scope-ignore: lease owner records an explicit operator filter decision
            await this.prisma.systemEventWebhook.updateMany({
              where: { id: row.id, leaseToken, isDeleted: false },
              data: {
                skippedAt: new Date(),
                leaseUntil: null,
                leaseToken: null,
              },
            });
            return;
          }
          const outcome = await this.destinationDelivery.deliver(
            row,
            leaseToken,
          );
          // tenant-scope-ignore: only the event lease owner may publish aggregate state
          await this.prisma.systemEventWebhook.updateMany({
            where: { id: row.id, leaseToken, isDeleted: false },
            data: {
              ...(outcome === 'delivered'
                ? { deliveredAt: new Date(), lastStatusCode: 200 }
                : outcome === 'skipped'
                  ? { skippedAt: new Date() }
                  : { nextAttemptAt: outcome }),
              leaseUntil: null,
              leaseToken: null,
            },
          });
        } catch (error) {
          // Do not log request errors: URLs may contain credentials and payloads contain identity data.
          const statusCode = systemNotificationStatusCode(error);
          const isExhausted = row.attempts + 1 >= MAX_EVENT_ATTEMPTS;
          this.logger.warn(
            isExhausted
              ? 'System event delivery failed permanently'
              : 'System event delivery will retry',
            { eventId: row.id, statusCode },
          );
          if (isExhausted) {
            // tenant-scope-ignore: lease owner ends an event that can never be processed
            await this.prisma.systemEventWebhook.updateMany({
              where: { id: row.id, leaseToken, isDeleted: false },
              data: {
                failedAt: new Date(),
                leaseUntil: null,
                leaseToken: null,
                lastStatusCode: statusCode,
              },
            });
            return;
          }
          // tenant-scope-ignore: lease owner alone may reschedule this delivery
          await this.prisma.systemEventWebhook.updateMany({
            where: { id: row.id, leaseToken, isDeleted: false },
            data: {
              nextAttemptAt: new Date(
                Date.now() +
                  Math.min(3_600_000, 30_000 * 2 ** Math.min(row.attempts, 7)),
              ),
              leaseUntil: null,
              leaseToken: null,
              lastStatusCode: statusCode,
            },
          });
        }
      }),
    );
  }
}
