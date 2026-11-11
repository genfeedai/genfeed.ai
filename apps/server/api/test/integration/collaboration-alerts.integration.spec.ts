import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { ActivityRecorderService } from '@api/services/activity-recording/activity-recorder.service';
import { CollaborationAlertsService } from '@api/services/collaboration-alerts/collaboration-alerts.service';
import { NotificationInboxService } from '@api/services/notifications/inbox/notification-inbox.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { ActivityKey } from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../scripts/assert-isolated-db-url';

/**
 * #9947: a review request, a review decision and a mention each put exactly one
 * bell item in front of the right member and none in front of anyone else.
 * Real PostgreSQL, real Prisma and the migration's real inbox trigger, in a
 * uniquely owned schema.
 */
describe('Collaboration alerts (real Postgres)', () => {
  const schema = `collab_alerts_${randomUUID().replaceAll('-', '')}`;
  let sql: Client;
  let prisma: PrismaClient;
  let alerts: CollaborationAlertsService;
  let inbox: NotificationInboxService;
  const queue = { enqueue: vi.fn() };
  const publisher = { publishInboxUpdate: vi.fn() };
  const logger = { error: vi.fn(), warn: vi.fn() };
  const migration = readFileSync(
    resolve(
      '../../../packages/prisma/prisma/migrations/20260927160000_activity_alert_policy/migration.sql',
    ),
    'utf8',
  );
  const triggerFunction = migration.match(
    /CREATE OR REPLACE FUNCTION materialize_notification_inbox_item\(\)[\s\S]*?\$\$;/,
  )?.[0];

  const organizationId = 'collab-org';
  const brandId = 'collab-brand';
  const requester = 'collab-requester';
  const reviewer = 'collab-reviewer';
  const bystander = 'collab-bystander';

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
    const asPrisma = prisma as unknown as PrismaService;
    alerts = new CollaborationAlertsService(
      asPrisma,
      new ActivityRecorderService(
        asPrisma,
        queue as never,
        publisher as never,
        logger as never,
      ),
      logger as never,
    );
    inbox = new NotificationInboxService(asPrisma);

    await prisma.user.createMany({
      data: [
        { firstName: 'Riley', handle: requester, id: requester },
        { handle: reviewer, id: reviewer },
        { handle: bystander, id: bystander },
      ],
    });
    await prisma.organization.create({
      data: {
        id: organizationId,
        label: 'Collab',
        slug: 'collab',
        userId: requester,
      },
    });
    await prisma.role.create({
      data: { id: 'collab-role', key: 'member', label: 'Member' },
    });
    await prisma.brand.create({
      data: {
        id: brandId,
        label: 'Collab Brand',
        organizationId,
        slug: 'collab-brand',
        userId: requester,
      },
    });
    for (const userId of [requester, reviewer, bystander]) {
      await prisma.member.create({
        data: {
          currentBrandId: brandId,
          id: `member-${userId}`,
          organizationId,
          roleId: 'collab-role',
          userId,
        },
      });
    }
  }, 90000);

  afterAll(async () => {
    await prisma?.$disconnect();
    if (sql) {
      await sql.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await sql.end();
    }
  });

  async function createAsset(): Promise<string> {
    const ingredient = await prisma.ingredient.create({
      data: { brandId, organizationId, userId: requester },
    });
    return ingredient.id;
  }

  async function bellItems(userId: string) {
    return prisma.notificationInboxItem.findMany({
      orderBy: { occurredAt: 'asc' },
      where: { organizationId, userId },
    });
  }

  it('puts one bell item in front of the reviewer, and no one else, for a review request', async () => {
    const ingredientId = await createAsset();
    const request = {
      actorUserId: requester,
      brandId,
      ingredientId,
      label: 'Spring teaser',
      organizationId,
      recipientUserId: reviewer,
      taskId: `task-${randomUUID()}`,
    };

    await alerts.notifyReviewRequested(request);
    await alerts.notifyReviewRequested(request);

    const forReviewer = await bellItems(reviewer);
    expect(forReviewer).toHaveLength(1);
    expect(forReviewer[0]).toMatchObject({
      readAt: null,
      topic: 'collaboration.activity',
    });
    expect(await bellItems(requester)).toEqual([]);
    expect(await bellItems(bystander)).toEqual([]);
  });

  it('links the item to the asset and says who asked', async () => {
    const ingredientId = await createAsset();
    await alerts.notifyReviewRequested({
      actorUserId: requester,
      brandId,
      ingredientId,
      label: 'Launch video',
      organizationId,
      recipientUserId: bystander,
      taskId: `task-${randomUUID()}`,
    });

    const { docs } = await inbox.list(organizationId, bystander);

    expect(docs).toEqual([
      expect.objectContaining({
        activity: expect.objectContaining({
          key: ActivityKey.ASSET_REVIEW_REQUESTED,
          value: 'Riley asked you to review “Launch video”.',
        }),
        sourceHref: `/collab/collab-brand/library/images?asset=${ingredientId}`,
      }),
    ]);
  });

  it('queues the email for a member who keeps email on, and writes none for the person who acted', async () => {
    const ingredientId = await createAsset();
    await alerts.notifyReviewRequested({
      actorUserId: requester,
      brandId,
      ingredientId,
      label: 'Teaser cut',
      organizationId,
      recipientUserId: reviewer,
      taskId: `task-${randomUUID()}`,
    });

    const deliveries = await prisma.notificationDelivery.findMany({
      orderBy: { createdAt: 'desc' },
      take: 2,
      where: { organizationId, topic: 'collaboration.activity' },
    });

    expect(
      deliveries
        .map(({ channel, userId }) => ({ channel, userId }))
        .sort((a, b) => a.channel.localeCompare(b.channel)),
    ).toEqual([
      { channel: 'email', userId: reviewer },
      { channel: 'in_app', userId: reviewer },
    ]);
  });

  it('tells the requester a decision, once for a burst, and never the reviewer', async () => {
    const ingredientId = await createAsset();
    const decision = {
      actorUserId: reviewer,
      brandId,
      decision: 'changes_requested' as const,
      ingredientId,
      label: 'Hero image',
      organizationId,
      reason: 'Crop tighter.',
      recipientUserId: requester,
      taskId: `task-${randomUUID()}`,
    };
    const before = (await bellItems(requester)).length;

    await alerts.notifyReviewDecided(decision);
    await alerts.notifyReviewDecided(decision);

    const forRequester = (await bellItems(requester)).slice(before);
    expect(forRequester).toHaveLength(1);
    const { docs } = await inbox.list(organizationId, requester);
    expect(docs[0]?.activity).toMatchObject({
      key: ActivityKey.ASSET_REVIEW_CHANGES_REQUESTED,
      value: expect.stringContaining('Crop tighter.'),
    });
  });

  it('puts one bell item in front of a mentioned member and none in front of others', async () => {
    const threadId = `thread-${randomUUID()}`;
    const mention = {
      actorUserId: requester,
      brandId,
      label: 'Launch plan',
      organizationId,
      recipientUserId: reviewer,
      source: { id: `message-${randomUUID()}`, type: 'agent_thread' as const },
      threadId,
    };
    const reviewerBefore = (await bellItems(reviewer)).length;
    const bystanderBefore = (await bellItems(bystander)).length;

    await alerts.notifyMention(mention);
    await alerts.notifyMention({
      ...mention,
      source: { id: `message-${randomUUID()}`, type: 'agent_thread' },
    });

    expect((await bellItems(reviewer)).length - reviewerBefore).toBe(1);
    expect((await bellItems(bystander)).length).toBe(bystanderBefore);
    const { docs } = await inbox.list(organizationId, reviewer);
    expect(docs[0]).toMatchObject({
      activity: expect.objectContaining({ key: ActivityKey.MENTIONED }),
      sourceHref: `/collab/collab-brand/agent/${threadId}`,
    });
  });

  it('does not tell a member about their own action', async () => {
    const before = (await bellItems(requester)).length;

    await alerts.notifyMention({
      actorUserId: requester,
      brandId,
      label: 'My own thread',
      organizationId,
      recipientUserId: requester,
      source: { id: `message-${randomUUID()}`, type: 'agent_thread' },
      threadId: `thread-${randomUUID()}`,
    });

    expect((await bellItems(requester)).length).toBe(before);
  });
});
