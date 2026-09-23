import { randomUUID } from 'node:crypto';
import { NotFoundException } from '@api/exceptions/not-found.exception';
import { NotificationsService } from '@api/services/notifications/notifications.service';
import type { SystemEvent } from '@api/services/system-events/system-event.types';
import { projectStripeSystemEvent } from '@api/services/system-events/system-event-projection';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { SYSTEM_EVENT_TYPES } from '@libs/interfaces/system-event.interface';
import { LoggerService } from '@libs/logger/logger.service';
import { BadRequestException, Injectable } from '@nestjs/common';
import type Stripe from 'stripe';

@Injectable()
export class SystemEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
    private readonly notifications: NotificationsService,
  ) {}

  private configuration() {
    const since = this.config.get('SYSTEM_EVENTS_ENABLED_AT');
    if (!since) return null;
    return { since: new Date(since) };
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
    const [settings, transport, rows, observedSignups, first] =
      await Promise.all([
        this.settings(),
        this.notifications.systemNotificationStatus().catch(() => ({
          webhookConfigured: false,
          transportConfigured: false,
        })),
        // tenant-scope-ignore: super-admin delivery history; payloads excluded from the response
        this.prisma.systemEventWebhook.findMany({
          where: { isDeleted: false },
          orderBy: { occurredAt: 'desc' },
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
      ]);
    return {
      id: 'system-notifications',
      configuration: {
        ...settings,
        ...transport,
        recordingEnabled: Boolean(this.configuration()),
      },
      observedSignups,
      signupObservationStart: first?.occurredAt.toISOString() ?? null,
      deliveries: rows.map((row) => ({
        id: row.id,
        type: row.type,
        occurredAt: row.occurredAt.toISOString(),
        status: row.deliveredAt
          ? 'delivered'
          : row.skippedAt
            ? 'skipped'
            : row.leaseUntil && row.leaseUntil > new Date()
              ? 'sending'
              : row.attempts > 0
                ? 'failed'
                : 'pending',
        attempts: row.attempts,
        lastStatusCode: row.lastStatusCode,
        deliveredAt: row.deliveredAt?.toISOString() ?? null,
      })),
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
    // tenant-scope-ignore: super-admin retries a single non-deleted event
    const row = await this.prisma.systemEventWebhook.findFirst({
      where: { id, isDeleted: false },
    });
    if (!row) throw new NotFoundException('Notification not found');
    if (row.deliveredAt || row.skippedAt) return;
    // tenant-scope-ignore: scheduling never bypasses another worker's lease
    await this.prisma.systemEventWebhook.updateMany({
      where: { id, isDeleted: false, deliveredAt: null, skippedAt: null },
      data: { nextAttemptAt: new Date() },
    });
  }

  async recordStripeEvent(event: Stripe.Event): Promise<void> {
    const payload = projectStripeSystemEvent(event);
    if (payload) await this.record(payload);
  }

  async recordSignup(userId: string): Promise<void> {
    if (!this.configuration()) return;
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
    const config = this.configuration();
    if (!config || new Date(event.occurredAt) < config.since) return;
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
    const config = this.configuration();
    if (!config) return;
    // Recover signup hook persistence failures without replaying pre-enablement accounts.
    // tenant-scope-ignore: deployment-wide system event recovery restricted to the configured observation window
    const users = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT u.id FROM users u
      WHERE u."isDeleted" = false AND u."createdAt" >= ${config.since}
        AND NOT EXISTS (SELECT 1 FROM system_event_webhooks e WHERE e.id = 'user.created/' || u.id)
      ORDER BY u."createdAt" ASC LIMIT 100
    `;
    for (const user of users) await this.recordSignup(user.id);
    const now = new Date();
    // tenant-scope-ignore: deployment-wide operator delivery worker
    const due = await this.prisma.systemEventWebhook.findMany({
      where: {
        isDeleted: false,
        deliveredAt: null,
        skippedAt: null,
        nextAttemptAt: { lte: now },
        OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
      },
      orderBy: { nextAttemptAt: 'asc' },
      take: 20,
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
            OR: [{ leaseUntil: null }, { leaseUntil: { lte: now } }],
          },
          data: {
            leaseToken,
            leaseUntil: new Date(Date.now() + 120_000),
            attempts: { increment: 1 },
          },
        });
        if (!claimed.count) return;
        let status: number | null = null;
        try {
          const settings = await this.settings();
          if (!settings.enabled || !settings.eventTypes.includes(row.type)) {
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
          await this.notifications.deliverSystemNotification(
            JSON.parse(row.payload) as SystemEvent,
          );
          status = 200;
          // tenant-scope-ignore: lease owner alone may finish this delivery
          await this.prisma.systemEventWebhook.updateMany({
            where: { id: row.id, leaseToken, isDeleted: false },
            data: {
              deliveredAt: new Date(),
              leaseUntil: null,
              leaseToken: null,
              lastStatusCode: status,
            },
          });
        } catch {
          // Do not log request errors: URLs may contain credentials and payloads contain identity data.
          this.logger.warn('System event delivery will retry', {
            eventId: row.id,
            statusCode: status,
          });
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
              lastStatusCode: status,
            },
          });
        }
      }),
    );
  }
}
