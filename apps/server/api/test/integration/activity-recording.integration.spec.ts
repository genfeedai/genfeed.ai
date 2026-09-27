import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivityKey, ActivitySource } from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

/**
 * #5197: an alert-worthy activity, its notification event, its deliveries and
 * the bell item all commit or roll back together. Real PostgreSQL, real Prisma
 * and the migration's real inbox trigger, in a uniquely owned schema.
 */
describe('Activity recording atomicity (real Postgres)', () => {
  const schema = `activity_rec_${randomUUID().replaceAll('-', '')}`;
  let sql: Client;
  let prisma: PrismaClient;
  let recorder: ActivityRecorderService;
  const queue = { enqueue: vi.fn() };
  const publisher = { publishInboxUpdate: vi.fn() };
  const streaks = {
    checkAndUpdate: vi.fn(),
    isQualifyingActivityKey: vi.fn().mockReturnValue(false),
  };
  const migration = readFileSync(
    resolve(
      '../../../packages/prisma/prisma/migrations/20260927160000_activity_alert_policy/migration.sql',
    ),
    'utf8',
  );
  const triggerFunction = migration.match(
    /CREATE OR REPLACE FUNCTION materialize_notification_inbox_item\(\)[\s\S]*?\$\$;/,
  )?.[0];

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
    expect(triggerFunction).toBeDefined();
    await sql.query(triggerFunction ?? '');
    await sql.query(
      'CREATE TRIGGER notification_delivery_inbox_insert AFTER INSERT ON "notification_deliveries" FOR EACH ROW EXECUTE FUNCTION materialize_notification_inbox_item()',
    );
    prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString }, { schema }),
    });
    recorder = new ActivityRecorderService(
      prisma as unknown as PrismaService,
      queue as never,
      publisher as never,
      { error: vi.fn(), warn: vi.fn() } as never,
      streaks as never,
    );
    await prisma.user.createMany({
      data: [
        { handle: 'alice', id: 'alice' },
        { handle: 'mallory', id: 'mallory' },
      ],
    });
    await prisma.organization.create({
      data: { id: 'alpha', label: 'Alpha', slug: 'alpha', userId: 'alice' },
    });
    await prisma.role.create({
      data: { id: 'owner', key: 'owner', label: 'Owner' },
    });
    await prisma.brand.create({
      data: {
        id: 'alpha-brand',
        label: 'Alpha Brand',
        organizationId: 'alpha',
        slug: 'alpha-brand',
        userId: 'alice',
      },
    });
    await prisma.member.create({
      data: {
        currentBrandId: 'alpha-brand',
        id: 'alice-alpha',
        organizationId: 'alpha',
        roleId: 'owner',
        userId: 'alice',
      },
    });
  }, 90000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  const failed = {
    brandId: 'alpha-brand',
    key: ActivityKey.IMAGE_FAILED,
    organizationId: 'alpha',
    source: ActivitySource.IMAGE_GENERATION,
    userId: 'alice',
    value: 'Provider timeout',
  };

  it('creates the activity, event, delivery and bell item together, linked by activity id', async () => {
    const activity = await recorder.record(failed);

    const event = await prisma.notificationEvent.findFirstOrThrow({
      where: { activityId: activity.id },
    });
    expect(event).toEqual(
      expect.objectContaining({
        eventKey: ActivityKey.IMAGE_FAILED,
        organizationId: 'alpha',
      }),
    );
    const deliveries = await prisma.notificationDelivery.findMany({
      where: { eventId: event.id },
    });
    expect(deliveries).toEqual([
      expect.objectContaining({
        channel: 'in_app',
        status: 'delivered',
        userId: 'alice',
      }),
    ]);
    const inbox = await prisma.notificationInboxItem.findMany({
      where: { eventId: event.id },
    });
    expect(inbox).toEqual([
      expect.objectContaining({
        activityId: activity.id,
        topic: 'generation.status',
        userId: 'alice',
      }),
    ]);
    expect(publisher.publishInboxUpdate).toHaveBeenCalledWith('alpha', [
      'alice',
    ]);
  });

  it('creates no notification for a history-only activity', async () => {
    const activity = await recorder.record({
      ...failed,
      key: ActivityKey.IMAGE_GENERATED,
    });

    expect(
      await prisma.notificationEvent.count({
        where: { activityId: activity.id },
      }),
    ).toBe(0);
    expect(await prisma.activity.count({ where: { id: activity.id } })).toBe(1);
  });

  it('rolls the activity and every outbox row back with the caller transaction', async () => {
    const before = {
      activities: await prisma.activity.count(),
      deliveries: await prisma.notificationDelivery.count(),
      events: await prisma.notificationEvent.count(),
      inbox: await prisma.notificationInboxItem.count(),
    };

    await expect(
      prisma.$transaction(async (transaction) => {
        await recorder.recordInTransaction(transaction, {
          ...failed,
          key: ActivityKey.VIDEO_FAILED,
        });
        throw new Error('abort');
      }),
    ).rejects.toThrow('abort');

    expect({
      activities: await prisma.activity.count(),
      deliveries: await prisma.notificationDelivery.count(),
      events: await prisma.notificationEvent.count(),
      inbox: await prisma.notificationInboxItem.count(),
    }).toEqual(before);
  });

  it('is idempotent for a repeated deduplication key', async () => {
    const input = {
      ...failed,
      alert: { deduplicationKey: `dedup/${randomUUID()}` },
      key: ActivityKey.POST_FAILED,
      source: ActivitySource.POST,
    };
    const first = await recorder.record(input);
    const second = await recorder.record(input);

    expect(second.id).toBe(first.id);
    expect(
      await prisma.notificationEvent.count({
        where: { deduplicationKey: input.alert.deduplicationKey },
      }),
    ).toBe(1);
  });

  it('raises the alert once when an update moves the key to a failure', async () => {
    const processing = await recorder.record({
      ...failed,
      key: ActivityKey.MUSIC_PROCESSING,
      source: ActivitySource.MUSIC_GENERATION,
    });
    const ref = { id: processing.id, organizationId: 'alpha' };

    await recorder.update(ref, { key: ActivityKey.MUSIC_FAILED });
    await recorder.update(ref, { key: ActivityKey.MUSIC_FAILED });

    const stored = await prisma.activity.findUniqueOrThrow({
      where: { id: processing.id },
    });
    expect(stored.action).toBe(ActivityKey.MUSIC_FAILED);
    expect(
      await prisma.notificationInboxItem.count({
        where: { activityId: processing.id },
      }),
    ).toBe(1);
  });

  it('never alerts a user who is not an active member', async () => {
    const activity = await recorder.record({ ...failed, userId: 'mallory' });
    const event = await prisma.notificationEvent.findFirstOrThrow({
      where: { activityId: activity.id },
    });

    expect(
      await prisma.notificationDelivery.count({ where: { eventId: event.id } }),
    ).toBe(0);
    expect(
      await prisma.notificationInboxItem.count({
        where: { eventId: event.id },
      }),
    ).toBe(0);
  });

  it('stores an operator channel delivery with no tenant user and no bell item', async () => {
    await recorder.dispatch({
      deduplicationKey: `model/${randomUUID()}`,
      messages: [
        {
          destination: null,
          message: {
            action: 'model_discovery',
            payload: {
              category: 'image',
              estimatedCost: 1,
              modelKey: 'fal-ai/new-model',
              provider: 'fal',
              providerCostUsd: 0.01,
            },
            type: 'discord',
          },
        },
      ],
      organizationId: null,
      source: { id: 'fal-ai/new-model', type: 'model_discovery' },
      topic: 'operator.alerts',
    });

    const delivery = await prisma.notificationDelivery.findFirstOrThrow({
      where: { channel: 'discord', organizationId: null },
    });
    expect(delivery).toEqual(
      expect.objectContaining({
        destination: null,
        status: 'pending',
        userId: null,
      }),
    );
    expect(delivery.message).toEqual(
      expect.objectContaining({ action: 'model_discovery', type: 'discord' }),
    );
    expect(queue.enqueue).toHaveBeenCalledWith(delivery.id);
    expect(
      await prisma.notificationInboxItem.count({
        where: { eventId: delivery.eventId },
      }),
    ).toBe(0);
  });
});
