import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { NotificationInboxService } from '@api/services/notifications/inbox/notification-inbox.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

// Real PostgreSQL and real Prisma queries in a uniquely owned schema. No shared table cleanup.
describe('Notification inbox rollout and isolation (real Postgres)', () => {
  const schema = `inbox_${randomUUID().replaceAll('-', '')}`;
  let sql: Client;
  let prisma: PrismaClient;
  let inbox: NotificationInboxService;
  const migration = readFileSync(
    resolve(
      '../../../packages/prisma/prisma/migrations/20260905140000_notification_inbox/migration.sql',
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
    expect(ddl).toContain('notification_inbox_items');
    await sql.query(
      ddl
        .replaceAll('"public".', '')
        .replace(/CREATE SCHEMA IF NOT EXISTS "public";/g, ''),
    );
    // Simulate the exact pre-rollout database using the real current schema.
    await sql.query('DROP TABLE notification_inbox_items');
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema }),
    });
    inbox = new NotificationInboxService(prisma as PrismaService);
    await prisma.user.createMany({
      data: [
        { id: 'alice', handle: 'alice' },
        { id: 'bob', handle: 'bob' },
        { id: 'deleted', handle: 'deleted', isDeleted: true },
      ],
    });
    await prisma.organization.createMany({
      data: [
        { id: 'alpha', userId: 'alice', slug: 'alpha', label: 'Alpha' },
        { id: 'bravo', userId: 'bob', slug: 'bravo', label: 'Bravo' },
      ],
    });
    await prisma.role.create({
      data: { id: 'owner', key: 'owner', label: 'Owner' },
    });
    await prisma.member.createMany({
      data: [
        {
          id: 'alice-alpha',
          userId: 'alice',
          organizationId: 'alpha',
          roleId: 'owner',
        },
        {
          id: 'bob-bravo',
          userId: 'bob',
          organizationId: 'bravo',
          roleId: 'owner',
        },
        {
          id: 'bob-alpha',
          userId: 'bob',
          organizationId: 'alpha',
          roleId: 'owner',
        },
      ],
    });
    await event('historical', 'alpha');
    await delivery(
      'historical-email',
      'historical',
      'alice',
      'alpha',
      'email',
      'skipped',
    );
    await delivery(
      'historical-other',
      'historical',
      'alice',
      'alpha',
      'other',
      'failed',
    );
    await delivery('historical-bob', 'historical', 'bob', 'alpha');
    await delivery('historical-deleted', 'historical', 'deleted', 'alpha');
    await sql.query(migration);
  }, 90000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  async function event(id: string, organizationId: string, isDeleted = false) {
    return prisma.notificationEvent.create({
      data: {
        id,
        organizationId,
        eventKey: 'workflow.execution.failed',
        deduplicationKey: id,
        sourceType: 'workflow_execution',
        sourceId: id,
        occurredAt: new Date('2026-09-05T10:00:00Z'),
        payload: { error: 'secret' },
        isDeleted,
      },
    });
  }
  async function delivery(
    id: string,
    eventId: string,
    userId: string,
    organizationId: string,
    channel = 'email',
    status = 'pending',
    isDeleted = false,
  ) {
    return prisma.notificationDelivery.create({
      data: {
        id,
        eventId,
        userId,
        organizationId,
        channel,
        topic: 'workflow.status',
        provider: 'test',
        status,
        idempotencyKey: id,
        isDeleted,
      },
    });
  }

  it('backfills retained skipped email recipients exactly once without preferences or sending email', async () => {
    expect(await prisma.notificationInboxItem.count()).toBe(2);
    expect((await inbox.list('alpha', 'alice')).docs).toHaveLength(1);
    expect(await inbox.count('alpha', 'alice')).toEqual({
      id: 'alpha',
      unreadCount: 1,
    });
    expect(await prisma.notificationPreference.count()).toBe(0);
    expect(
      (
        await prisma.notificationDelivery.findUniqueOrThrow({
          where: { id: 'historical-email' },
        })
      ).status,
    ).toBe('skipped');
  });
  it('isolates recipients, persists read state, and never mutates delivery status', async () => {
    const alice = (await inbox.list('alpha', 'alice')).docs[0];
    await inbox.markRead('alpha', 'bob', [alice.id]);
    expect((await inbox.count('alpha', 'alice')).unreadCount).toBe(1);
    await inbox.markRead('alpha', 'alice', [alice.id]);
    const readAt = (await inbox.list('alpha', 'alice')).docs[0].readAt;
    await inbox.markRead('alpha', 'alice', [alice.id]);
    expect((await inbox.list('alpha', 'alice')).docs[0].readAt).toEqual(readAt);
    expect((await inbox.count('alpha', 'alice')).unreadCount).toBe(0);
    expect((await inbox.count('alpha', 'bob')).unreadCount).toBe(1);
    expect(
      (
        await prisma.notificationDelivery.findUniqueOrThrow({
          where: { id: 'historical-email' },
        })
      ).status,
    ).toBe('skipped');
    await delivery(
      'duplicate-channel',
      'historical',
      'alice',
      'alpha',
      'another',
    );
    expect((await inbox.list('alpha', 'alice')).docs[0].readAt).toEqual(readAt);
  });
  it('supports an old producer after rollout, atomically rolls back, and ignores deleted records', async () => {
    await event('new', 'alpha');
    await delivery('old-writer', 'new', 'alice', 'alpha');
    expect(
      await prisma.notificationInboxItem.count({ where: { eventId: 'new' } }),
    ).toBe(1);
    await event('deleted-event', 'alpha', true);
    await delivery('deleted-source', 'deleted-event', 'alice', 'alpha');
    await delivery(
      'deleted-delivery',
      'new',
      'bob',
      'alpha',
      'email',
      'pending',
      true,
    );
    expect(
      await prisma.notificationInboxItem.count({
        where: { eventId: 'deleted-event' },
      }),
    ).toBe(0);
    expect(
      await prisma.notificationInboxItem.count({
        where: { eventId: 'new', userId: 'bob' },
      }),
    ).toBe(0);
    await expect(
      prisma.$transaction(async (tx) => {
        await tx.notificationDelivery.create({
          data: {
            id: 'rolled-back',
            eventId: 'new',
            userId: 'bob',
            organizationId: 'alpha',
            channel: 'other',
            topic: 'agent.status',
            provider: 'test',
            idempotencyKey: 'rollback',
          },
        });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');
    expect(
      await prisma.notificationInboxItem.count({
        where: { userId: 'bob', eventId: 'new' },
      }),
    ).toBe(0);
  });
  it('paginates equal timestamps without losing older records', async () => {
    for (let i = 0; i < 35; i++) {
      await event(`page-${i}`, 'alpha');
      await delivery(`page-${i}`, `page-${i}`, 'alice', 'alpha');
    }
    const first = await inbox.list('alpha', 'alice');
    expect(first.docs).toHaveLength(30);
    const next = await inbox.list(
      'alpha',
      'alice',
      first.nextCursor ?? undefined,
    );
    expect(next.docs.length).toBeGreaterThan(0);
    const ids = [...first.docs, ...next.docs].map((row) => row.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.length).toBe(
      await prisma.notificationInboxItem.count({
        where: { organizationId: 'alpha', userId: 'alice' },
      }),
    );
    await inbox.markRead('alpha', 'alice', null);
    expect((await inbox.count('alpha', 'alice')).unreadCount).toBe(0);
  });
  it('opens owned branded sources for unrestricted members and hides unassigned brands', async () => {
    await prisma.role.create({
      data: { id: 'creator', key: 'creator', label: 'Creator' },
    });
    await prisma.brand.createMany({
      data: ['brand-a', 'brand-b'].map((id) => ({
        id,
        slug: id,
        label: id,
        organizationId: 'alpha',
        userId: 'alice',
        isSelected: false,
      })),
    });
    await prisma.member.update({
      where: { id: 'alice-alpha' },
      data: { roleId: 'creator' },
    });
    await prisma.agentThread.create({
      data: {
        id: 'branded-thread',
        userId: 'alice',
        organizationId: 'alpha',
        brandId: 'brand-a',
      },
    });
    await prisma.agentThreadEvent.create({
      data: {
        organizationId: 'alpha',
        threadId: 'branded-thread',
        sequence: 1,
        runId: 'branded-run',
      },
    });
    await prisma.notificationEvent.create({
      data: {
        id: 'branded-event',
        organizationId: 'alpha',
        eventKey: 'agent.run.failed',
        deduplicationKey: 'branded-event',
        sourceType: 'agent_run',
        sourceId: 'branded-run',
        occurredAt: new Date('2026-09-05T12:00:00Z'),
        payload: {},
      },
    });
    await prisma.notificationDelivery.create({
      data: {
        id: 'branded-delivery',
        eventId: 'branded-event',
        userId: 'alice',
        organizationId: 'alpha',
        channel: 'email',
        topic: 'agent.status',
        provider: 'test',
        idempotencyKey: 'branded-delivery',
      },
    });
    expect((await inbox.list('alpha', 'alice')).docs[0].sourceHref).toBe(
      '/alpha/brand-a/agent/branded-thread',
    );
    await prisma.member.update({
      where: { id: 'alice-alpha' },
      data: { brands: { connect: { id: 'brand-b' } } },
    });
    expect((await inbox.list('alpha', 'alice')).docs[0].sourceHref).toBeNull();
    await prisma.member.update({
      where: { id: 'alice-alpha' },
      data: { roleId: 'owner', brands: { set: [] } },
    });
  });
  it('denies cross-organization and revoked membership for every operation', async () => {
    for (const action of [
      () => inbox.list('bravo', 'alice'),
      () => inbox.count('bravo', 'alice'),
      () => inbox.markRead('bravo', 'alice', null),
    ])
      await expect(action()).rejects.toThrow('Active membership required');
    await prisma.member.update({
      where: { id: 'alice-alpha' },
      data: { isActive: false },
    });
    for (const action of [
      () => inbox.list('alpha', 'alice'),
      () => inbox.count('alpha', 'alice'),
      () => inbox.markRead('alpha', 'alice', ['inbox_old-writer']),
      () => inbox.markRead('alpha', 'alice', null),
    ])
      await expect(action()).rejects.toThrow('Active membership required');
  });
});
