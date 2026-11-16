import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaClient } from '@genfeedai/prisma';
import type { LoggerService } from '@libs/logger/logger.service';
import type { PrismaService } from '@libs/prisma/prisma.service';
import { PrismaPg } from '@prisma/adapter-pg';
import { CronNotificationRetentionService } from '@workers/crons/notification-retention/cron.notification-retention.service';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const NOW = new Date('2026-11-16T12:00:00.000Z');

function daysBefore(days: number, from: Date = NOW): Date {
  return new Date(from.getTime() - days * MS_PER_DAY);
}

// Real PostgreSQL and real Prisma queries in a uniquely owned schema. No shared table cleanup.
describe('Notification retention (real Postgres)', () => {
  const schema = `retention_${randomUUID().replaceAll('-', '')}`;
  let sql: Client;
  let prisma: PrismaClient;
  let service: CronNotificationRetentionService;
  const migrationSql = readFileSync(
    resolve(
      '../../../packages/prisma/prisma/migrations/20261116140000_purge_workflow_status_notification_rows/migration.sql',
    ),
    'utf8',
  );

  beforeAll(async () => {
    const connectionString = assertIsolatedDatabaseUrl();
    sql = new Client({ connectionString });
    await sql.connect();
    await sql.query(`CREATE SCHEMA "${schema}"`);
    await sql.query(`SET search_path TO "${schema}", public`);
    const ddl = execFileSync(
      'bunx',
      [
        'prisma',
        'migrate',
        'diff',
        '--from-empty',
        '--to-schema',
        resolve('../../../packages/prisma/prisma/schema.prisma'),
        '--script',
      ],
      {
        cwd: resolve('../../../packages/prisma'),
        encoding: 'utf8',
        timeout: 60000,
      },
    );
    await sql.query(
      ddl
        .replaceAll('"public".', '')
        .replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, ''),
    );
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema }),
    });
    service = new CronNotificationRetentionService(
      { log: () => undefined } as unknown as LoggerService,
      prisma as unknown as PrismaService,
    );
    await prisma.user.create({ data: { id: 'alice', handle: 'alice' } });
    await prisma.organization.create({
      data: { id: 'alpha', userId: 'alice', slug: 'alpha', label: 'Alpha' },
    });
  }, 90000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  beforeEach(async () => {
    await prisma.emailMessage.deleteMany();
    await prisma.notificationInboxItem.deleteMany();
    await prisma.notificationDelivery.deleteMany();
    await prisma.notificationEvent.deleteMany();
    await prisma.dataBackfill.deleteMany();
  });

  async function event(
    id: string,
    occurredAt: Date,
    eventKey = 'workflow-execution-completed',
  ) {
    return prisma.notificationEvent.create({
      data: {
        deduplicationKey: id,
        eventKey,
        id,
        occurredAt,
        organizationId: 'alpha',
        payload: {},
        sourceId: id,
        sourceType: 'workflow_execution',
      },
    });
  }

  async function delivery(
    id: string,
    eventId: string,
    createdAt: Date,
    status = 'delivered',
    topic = 'workflow.status',
    channel = 'in_app',
  ) {
    return prisma.notificationDelivery.create({
      data: {
        channel,
        createdAt,
        eventId,
        id,
        idempotencyKey: id,
        organizationId: 'alpha',
        provider: 'test',
        status,
        topic,
        userId: 'alice',
      },
    });
  }

  /** One inbox item per (event, user): an item on the shared `e1` gets its own event. */
  async function inboxItem(
    id: string,
    sharedEventId: string,
    occurredAt: Date,
    readAt: Date | null,
  ) {
    const eventId = sharedEventId === 'e1' ? `event-of-${id}` : sharedEventId;
    if (eventId !== sharedEventId) await event(eventId, daysBefore(1));
    return prisma.notificationInboxItem.create({
      data: {
        eventId,
        id,
        occurredAt,
        organizationId: 'alpha',
        readAt,
        topic: 'workflow.status',
        userId: 'alice',
      },
    });
  }

  async function ids(
    model:
      | 'notificationDelivery'
      | 'notificationEvent'
      | 'notificationInboxItem',
  ): Promise<string[]> {
    const rows = await (
      prisma[model] as unknown as {
        findMany: (args: {
          orderBy: { id: 'asc' };
          select: { id: true };
        }) => Promise<Array<{ id: string }>>;
      }
    ).findMany({ orderBy: { id: 'asc' }, select: { id: true } });
    return rows.map((row) => row.id);
  }

  describe('deliveries', () => {
    it('deletes a delivery in a final state past 30 days and keeps the rest', async () => {
      await event('e1', daysBefore(1));
      await delivery('delivered-old', 'e1', daysBefore(31));
      await delivery(
        'skipped-old',
        'e1',
        daysBefore(31),
        'skipped',
        'workflow.status',
        'email',
      );
      await delivery(
        'failed-old',
        'e1',
        daysBefore(31),
        'failed',
        'agent.status',
        'whatsapp',
      );
      await delivery(
        'delivered-inside',
        'e1',
        daysBefore(29),
        'delivered',
        'workflow.status',
        'discord',
      );
      await delivery(
        'pending-old',
        'e1',
        daysBefore(60),
        'pending',
        'workflow.status',
        'telegram',
      );
      await delivery(
        'retry-old',
        'e1',
        daysBefore(60),
        'retry_pending',
        'workflow.status',
        'slack',
      );

      const totals = await service.purgeExpiredNotifications(NOW);

      expect(totals.deliveries).toBe(3);
      expect(await ids('notificationDelivery')).toEqual([
        'delivered-inside',
        'pending-old',
        'retry-old',
      ]);
    });

    it('keeps a delivery that owns a tracked email message', async () => {
      await event('e1', daysBefore(1));
      await delivery(
        'tracked',
        'e1',
        daysBefore(40),
        'delivered',
        'lifecycle.onboarding',
        'email',
      );
      await delivery(
        'untracked',
        'e1',
        daysBefore(40),
        'delivered',
        'lifecycle.onboarding',
        'discord',
      );
      await prisma.emailMessage.create({
        data: {
          clickTokenHash: 'hash',
          deliveryId: 'tracked',
          destinationUrl: 'https://app.genfeed.ai',
          organizationId: 'alpha',
          templateKey: 'welcome',
          userId: 'alice',
        },
      });

      await service.purgeExpiredNotifications(NOW);

      expect(await ids('notificationDelivery')).toEqual(['tracked']);
    });

    it('drains a backlog larger than one batch', async () => {
      await event('e1', daysBefore(1));
      await prisma.notificationDelivery.createMany({
        data: Array.from({ length: 2500 }, (_, index) => ({
          channel: 'email',
          createdAt: daysBefore(45),
          eventId: 'e1',
          idempotencyKey: `bulk-${index}`,
          organizationId: 'alpha',
          provider: 'test',
          status: 'skipped',
          topic: 'workflow.status',
          userId: null,
        })),
      });
      await delivery('fresh', 'e1', daysBefore(2));

      const totals = await service.purgeExpiredNotifications(NOW);

      expect(totals.deliveries).toBe(2500);
      expect(await ids('notificationDelivery')).toEqual(['fresh']);
    });
  });

  describe('inbox items', () => {
    it('deletes a read item 30 days after it was read and an item past 90 days', async () => {
      await event('e1', daysBefore(1));
      await inboxItem('read-31', 'e1', daysBefore(35), daysBefore(31));
      await inboxItem('read-29', 'e1', daysBefore(35), daysBefore(29));
      await inboxItem('unread-91', 'e1', daysBefore(91), null);
      await inboxItem(
        'read-recent-but-91-old',
        'e1',
        daysBefore(91),
        daysBefore(1),
      );

      const totals = await service.purgeExpiredNotifications(NOW);

      expect(totals.inboxItems).toBe(3);
      expect(await ids('notificationInboxItem')).toEqual(['read-29']);
    });

    it('keeps an unread item younger than 90 days', async () => {
      await event('e1', daysBefore(1));
      await inboxItem('unread-89', 'e1', daysBefore(89), null);
      await inboxItem('unread-45', 'e1', daysBefore(45), null);

      await service.purgeExpiredNotifications(NOW);

      expect(await ids('notificationInboxItem')).toEqual([
        'unread-45',
        'unread-89',
      ]);
    });
  });

  describe('events', () => {
    it('deletes an unreferenced event past 90 days and keeps one inside the window', async () => {
      await event('old', daysBefore(91));
      await event('inside', daysBefore(89));

      const totals = await service.purgeExpiredNotifications(NOW);

      expect(totals.events).toBe(1);
      expect(await ids('notificationEvent')).toEqual(['inside']);
    });

    it('keeps an old event that an unread inbox item or a live delivery still references', async () => {
      await event('with-inbox', daysBefore(91));
      await inboxItem('unread-60', 'with-inbox', daysBefore(60), null);
      await event('with-pending-delivery', daysBefore(91));
      await delivery(
        'pending',
        'with-pending-delivery',
        daysBefore(1),
        'pending',
        'workflow.status',
        'email',
      );
      await event('unreferenced', daysBefore(91));

      await service.purgeExpiredNotifications(NOW);

      expect(await ids('notificationEvent')).toEqual([
        'with-inbox',
        'with-pending-delivery',
      ]);
    });

    it('removes an old event together with its expired deliveries and inbox items in one run', async () => {
      await event('old', daysBefore(100));
      await delivery('d', 'old', daysBefore(100));
      await inboxItem('i', 'old', daysBefore(100), null);

      const totals = await service.purgeExpiredNotifications(NOW);

      expect(totals).toEqual({ deliveries: 1, events: 1, inboxItems: 1 });
      expect(await ids('notificationEvent')).toEqual([]);
    });
  });

  describe('backlog cleanup migration', () => {
    // The migration uses the database clock, so rows are placed relative to now().
    const realNow = () => new Date();

    it('deletes skipped workflow status emails past 30 days and the events nothing references', async () => {
      const now = realNow();
      await event(
        'orphan-failed',
        daysBefore(60, now),
        'workflow-execution-failed',
      );
      await delivery(
        'skipped-old',
        'orphan-failed',
        daysBefore(60, now),
        'skipped',
        'workflow.status',
        'email',
      );
      await event('orphan-completed', daysBefore(40, now));
      await delivery(
        'skipped-old-2',
        'orphan-completed',
        daysBefore(40, now),
        'skipped',
        'workflow.status',
        'email',
      );
      await event('bell', daysBefore(60, now));
      await delivery(
        'bell-email',
        'bell',
        daysBefore(60, now),
        'skipped',
        'workflow.status',
        'email',
      );
      await delivery('bell-inapp', 'bell', daysBefore(60, now));
      await event('inbox-only', daysBefore(60, now));
      await inboxItem(
        'inbox-only-item',
        'inbox-only',
        daysBefore(60, now),
        null,
      );
      await event('recent', daysBefore(5, now));
      await delivery(
        'skipped-recent',
        'recent',
        daysBefore(5, now),
        'skipped',
        'workflow.status',
        'email',
      );
      await event(
        'other-topic',
        daysBefore(60, now),
        'trend.refresh.completed',
      );
      await delivery(
        'skipped-other',
        'other-topic',
        daysBefore(60, now),
        'skipped',
        'agent.status',
        'email',
      );
      await event('tracked', daysBefore(60, now));
      await delivery(
        'skipped-tracked',
        'tracked',
        daysBefore(60, now),
        'skipped',
        'workflow.status',
        'email',
      );
      await prisma.emailMessage.create({
        data: {
          clickTokenHash: 'tracked-hash',
          deliveryId: 'skipped-tracked',
          destinationUrl: 'https://app.genfeed.ai',
          organizationId: 'alpha',
          templateKey: 'welcome',
          userId: 'alice',
        },
      });

      await sql.query(migrationSql);

      expect(await ids('notificationDelivery')).toEqual([
        'bell-inapp',
        'skipped-other',
        'skipped-recent',
        'skipped-tracked',
      ]);
      expect(await ids('notificationEvent')).toEqual([
        'bell',
        'inbox-only',
        'other-topic',
        'recent',
        'tracked',
      ]);
      const report = await prisma.dataBackfill.findUniqueOrThrow({
        where: { id: 'purge_workflow_status_notification_rows_20261116' },
      });
      expect(report.report).toEqual({ deliveriesDeleted: 3, eventsDeleted: 2 });
    });

    it('is safe to apply a second time', async () => {
      await event('orphan', daysBefore(60, realNow()));
      await delivery(
        'skipped-old',
        'orphan',
        daysBefore(60, realNow()),
        'skipped',
        'workflow.status',
        'email',
      );

      await sql.query(migrationSql);
      await sql.query(migrationSql);

      expect(await ids('notificationDelivery')).toEqual([]);
      expect(await ids('notificationEvent')).toEqual([]);
    });

    it('drains a backlog larger than one batch', async () => {
      await event('e1', daysBefore(60, realNow()));
      await delivery(
        'keep',
        'e1',
        daysBefore(60, realNow()),
        'pending',
        'workflow.status',
        'email',
      );
      await prisma.notificationDelivery.createMany({
        data: Array.from({ length: 5200 }, (_, index) => ({
          channel: 'email',
          createdAt: daysBefore(60, realNow()),
          eventId: 'e1',
          idempotencyKey: `bulk-${index}`,
          organizationId: 'alpha',
          provider: 'test',
          status: 'skipped',
          topic: 'workflow.status',
          userId: null,
        })),
      });

      await sql.query(migrationSql);

      expect(await ids('notificationDelivery')).toEqual(['keep']);
    });
  });
});
