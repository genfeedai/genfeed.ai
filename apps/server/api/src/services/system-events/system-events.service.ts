import { createHmac, randomUUID } from 'node:crypto';
import type { SystemEvent } from '@api/services/system-events/system-event.types';
import { projectStripeSystemEvent } from '@api/services/system-events/system-event-projection';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { safeFetch } from '@libs/security/destination-guard';
import { Injectable } from '@nestjs/common';
import type Stripe from 'stripe';

@Injectable()
export class SystemEventsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly logger: LoggerService,
  ) {}

  private configuration() {
    const endpoint = this.config.get('SYSTEM_EVENTS_WEBHOOK_URL');
    const secret = this.config.get('SYSTEM_EVENTS_WEBHOOK_SECRET');
    const since = this.config.get('SYSTEM_EVENTS_ENABLED_AT');
    if (!endpoint || !secret || !since) return null;
    return { endpoint, secret, since: new Date(since) };
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
          const timestamp = Math.floor(Date.now() / 1000).toString();
          const signature = createHmac('sha256', config.secret)
            .update(`${timestamp}.${row.payload}`)
            .digest('hex');
          const response = await safeFetch(
            config.endpoint,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                'X-Genfeed-Timestamp': timestamp,
                'X-Genfeed-Signature': signature,
              },
              body: JSON.stringify({ payload: row.payload }),
              signal: AbortSignal.timeout(30_000),
            },
            { maxRedirects: 0 },
          );
          status = response.status;
          await response.body?.cancel();
          if (!response.ok) throw new Error('Receiver rejected system event');
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
