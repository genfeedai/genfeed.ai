import { randomUUID } from 'node:crypto';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { PlatformWorkflowSchedulesService } from '@workers/scheduling/platform-workflow-schedules.service';
import { createFixtureTables } from '@workers/testing/schema-fixture-tables';
import { Pool } from 'pg';
import {
  afterAll,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: a disposable loopback database, never production.
const connection = process.env.WORKFLOW_BILLING_TEST_DATABASE_URL;

/**
 * Which organizations the platform analytics sweeps reach, against real
 * PostgreSQL rows (#11097): an organization that publishes is measured without
 * a recent browser session, and one that published nothing costs nothing.
 */
describe.skipIf(!connection)('Platform analytics sweeps (PostgreSQL)', () => {
  const schema = `analytics_sweep_${randomUUID().replaceAll('-', '')}`;
  const now = new Date('2026-11-24T10:00:00.000Z');
  const hoursAgo = (hours: number) =>
    new Date(now.getTime() - hours * 60 * 60 * 1000);
  let pool: Pool;
  let prisma: PrismaClient;
  let service: PlatformWorkflowSchedulesService;
  const dispatched: Array<{ canonicalId: string; organizationId: string }> = [];

  const runner = {
    enqueueWorkflow: vi.fn(
      async (input: { canonicalId: string; organizationId: string }) => {
        dispatched.push({
          canonicalId: input.canonicalId,
          organizationId: input.organizationId,
        });
        return { executionId: randomUUID() };
      },
    ),
  };
  const logger = { error: vi.fn(), log: vi.fn() };
  const moduleAccess = { canStartWork: vi.fn(async () => true) };

  async function seedOrganization(input: {
    id: string;
    sessionAgeHours?: number;
  }) {
    const userId = `${input.id}-owner`;
    await prisma.user.createMany({
      data: [{ handle: userId, id: userId }],
    });
    await prisma.organization.createMany({
      data: [{ id: input.id, label: input.id, slug: input.id, userId }],
    });
    if (input.sessionAgeHours !== undefined) {
      await prisma.session.createMany({
        data: [
          {
            expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
            id: `${input.id}-session`,
            token: `${input.id}-token`,
            updatedAt: hoursAgo(input.sessionAgeHours),
            userId,
          },
        ],
      });
    }
  }

  async function seedPost(input: {
    id: string;
    organizationId: string;
    externalId?: string | null;
    isDeleted?: boolean;
    nextCollectHoursFromNow?: number;
    state?: string;
  }) {
    await prisma.post.createMany({
      data: [
        {
          analyticsNextCollectAt: new Date(
            now.getTime() +
              (input.nextCollectHoursFromNow ?? -1) * 60 * 60 * 1000,
          ),
          brandId: `${input.organizationId}-brand`,
          description: 'post',
          externalId:
            input.externalId === undefined ? `x-${input.id}` : input.externalId,
          id: input.id,
          isDeleted: input.isDeleted ?? false,
          organizationId: input.organizationId,
          targetExecutionState: input.state ?? 'published',
          userId: `${input.organizationId}-owner`,
        },
      ],
    });
  }

  beforeAll(async () => {
    if (
      !connection ||
      !['localhost', '127.0.0.1', '[::1]'].includes(
        new URL(connection).hostname,
      )
    ) {
      throw new Error('Dedicated loopback PostgreSQL fixture is mandatory');
    }
    pool = new Pool({ connectionString: connection, max: 2 });
    const setup = await pool.connect();
    try {
      await setup.query(`CREATE SCHEMA "${schema}"`);
      await setup.query(`SET search_path TO "${schema}"`);
      await createFixtureTables(
        { query: setup.query.bind(setup) },
        new Set([
          'Member',
          'Organization',
          'Post',
          'Session',
          'User',
          'Workflow',
          'WorkflowExecution',
        ]),
      );
    } finally {
      setup.release();
    }
    const url = new URL(connection);
    url.searchParams.set('options', `-c search_path=${schema}`);
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: url.toString(), max: 2 },
        { schema },
      ),
    });
    service = new PlatformWorkflowSchedulesService(
      prisma as never,
      runner as never,
      logger as never,
      {} as never,
      {} as never,
      {} as never,
      moduleAccess as never,
    );
  });

  beforeEach(async () => {
    dispatched.length = 0;
    await pool.query(
      `TRUNCATE ${[
        'posts',
        'sessions',
        'organizations',
        'users',
        'members',
        'workflows',
        'workflow_executions',
      ]
        .map((table) => `"${schema}"."${table}"`)
        .join(', ')}`,
    );
  });

  afterAll(async () => {
    await pool?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await prisma?.$disconnect();
    await pool?.end();
  });

  const reached = (canonicalId: string) =>
    dispatched
      .filter((call) => call.canonicalId === canonicalId)
      .map((call) => call.organizationId)
      .sort();

  async function seedOrganizations() {
    // Published an X post, owner last opened the app 10 days ago.
    await seedOrganization({ id: 'org-away', sessionAgeHours: 240 });
    await seedPost({ id: 'post-away', organizationId: 'org-away' });
    // Published, opened the app an hour ago.
    await seedOrganization({ id: 'org-active', sessionAgeHours: 1 });
    await seedPost({ id: 'post-active', organizationId: 'org-active' });
    // Nothing published: a draft and a scheduled post only.
    await seedOrganization({ id: 'org-idle', sessionAgeHours: 1 });
    await seedPost({
      id: 'post-draft',
      organizationId: 'org-idle',
      externalId: null,
      state: 'draft',
    });
    await seedPost({
      id: 'post-scheduled',
      organizationId: 'org-idle',
      externalId: null,
      state: 'scheduled',
    });
    // Published but not yet due for collection again.
    await seedOrganization({ id: 'org-not-due', sessionAgeHours: 240 });
    await seedPost({
      id: 'post-not-due',
      organizationId: 'org-not-due',
      nextCollectHoursFromNow: 5,
    });
    // Its only published post was deleted, and another has no external id.
    await seedOrganization({ id: 'org-deleted', sessionAgeHours: 240 });
    await seedPost({
      id: 'post-deleted',
      isDeleted: true,
      organizationId: 'org-deleted',
    });
    await seedPost({
      externalId: null,
      id: 'post-no-external-id',
      organizationId: 'org-deleted',
    });
  }

  it('collects for every organization with a due published post, session or not', async () => {
    await seedOrganizations();

    await service.sweep('analytics-collect', now.getTime());

    expect(reached('analytics.organization-refresh')).toEqual([
      'org-active',
      'org-away',
    ]);
  });

  it('syncs content performance for every organization that published, due or not', async () => {
    await seedOrganizations();

    await service.sweep('analytics-sync', now.getTime());

    expect(reached('analytics-sync')).toEqual([
      'org-active',
      'org-away',
      'org-not-due',
    ]);
  });

  it('still gates Discovery enrichment on a recent session', async () => {
    await seedOrganizations();

    await service.sweep('content-learning.reconcile', now.getTime());

    expect(reached('content-learning.reconcile')).toEqual([
      'org-active',
      'org-idle',
    ]);
  });
});
