import 'reflect-metadata';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import {
  learningFence,
  learningOrgFence,
} from '@api/collections/content-learning/services/learning-dependency.service';
import { PostLifecycleService } from '@api/post-lifecycle/post-lifecycle.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  Platform,
  PostCategory,
  PostFormat,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { SchedulerPublishStateService } from '@workers/services/scheduler-publish-state.service';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../../../scripts/assert-isolated-db-url';

function deferred() {
  let resolveDeferred!: () => void;
  const promise = new Promise<void>((done) => {
    resolveDeferred = done;
  });
  return { promise, resolve: resolveDeferred };
}

// Real PostgreSQL advisory locks and real Prisma transitions in an owned schema (#5882).
describe('Per-organization learning fence (real Postgres)', () => {
  const schema = `learning_fence_${randomUUID().replaceAll('-', '')}`;
  const userId = randomUUID();
  const [orgA, orgB] = [randomUUID(), randomUUID()];
  const logger = {
    debug: vi.fn(),
    error: vi.fn(),
    log: vi.fn(),
    warn: vi.fn(),
  };
  let sql: Client;
  let prisma: PrismaClient;
  let scheduler: SchedulerPublishStateService;

  const waitingFor = async (organizationId: string): Promise<number> => {
    const result = await sql.query(
      `SELECT COUNT(*)::int AS waiting FROM pg_locks
       WHERE locktype = 'advisory' AND NOT granted AND classid = 5729
         AND objid::bigint = (hashtext($1)::bigint & 4294967295)`,
      [organizationId],
    );
    return result.rows[0].waiting;
  };
  const waitingForGlobal = async (): Promise<number> => {
    const result = await sql.query(
      `SELECT COUNT(*)::int AS waiting FROM pg_locks
       WHERE locktype = 'advisory' AND NOT granted AND classid = 5728
         AND objid = 1 AND objsubid = 2`,
    );
    return result.rows[0].waiting;
  };
  const hold = (
    acquire: (
      tx: Parameters<Parameters<PrismaClient['$transaction']>[0]>[0],
    ) => Promise<void>,
  ) => {
    const held = deferred();
    const release = deferred();
    const done = prisma.$transaction(
      async (tx) => {
        await acquire(tx);
        held.resolve();
        await release.promise;
      },
      { timeout: 30_000 },
    );
    return { done, held: held.promise, release: release.resolve };
  };
  const seedPost = async (
    organizationId: string,
    brandId: string,
  ): Promise<string> => {
    const id = randomUUID();
    await prisma.post.create({
      data: {
        id,
        brandId,
        category: PostCategory.TEXT,
        description: `Fence publication ${id}`,
        format: PostFormat.STANDARD,
        organizationId,
        platform: Platform.TWITTER,
        targetAttachments: [],
        targetExecutionState: TargetExecutionState.PUBLISHING,
        targetSettings: {},
        timezone: 'UTC',
        userId,
        visibility: PostVisibility.PUBLIC,
      },
    });
    return id;
  };
  const brands = new Map<string, string>();
  const publish = (organizationId: string, postId: string) =>
    scheduler.transitionPost(
      { id: postId, organizationId },
      {
        executionState: TargetExecutionState.PUBLISHED,
        externalId: `external-${postId}`,
        publishedAt: new Date(),
      },
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
    // Scheduler locks use raw SQL, which resolves tables through search_path.
    const scoped = new URL(connectionString);
    scoped.searchParams.set('options', `-c search_path=${schema},public`);
    prisma = new PrismaClient({
      adapter: new PrismaPg(
        { connectionString: scoped.toString() },
        { schema },
      ),
    });
    scheduler = new SchedulerPublishStateService(
      prisma as unknown as PrismaService,
      logger as never,
      new PostLifecycleService(prisma as never, logger as never),
    );
    await prisma.user.create({
      data: { id: userId, handle: `fence-${userId}` },
    });
    for (const organizationId of [orgA, orgB]) {
      await prisma.organization.create({
        data: {
          id: organizationId,
          label: 'Fence organization',
          slug: `fence-${organizationId}`,
          userId,
        },
      });
      const brandId = randomUUID();
      await prisma.brand.create({
        data: {
          id: brandId,
          isActive: true,
          label: 'Fence brand',
          organizationId,
          slug: `fence-${brandId}`,
          userId,
        },
      });
      brands.set(organizationId, brandId);
    }
  }, 120_000);

  afterAll(async () => {
    await prisma?.$disconnect();
    await sql?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
    await sql?.end();
  });

  it('publishes for one organization while another organization holds its fence', async () => {
    const postA = await seedPost(orgA, brands.get(orgA) as string);
    const postB = await seedPost(orgB, brands.get(orgB) as string);
    const holder = hold((tx) => learningOrgFence(tx, orgA, 'exclusive'));
    let blocked: Promise<boolean> | undefined;
    try {
      await holder.held;
      await expect(publish(orgB, postB)).resolves.toBe(true);
      blocked = publish(orgA, postA);
      await expect.poll(() => waitingFor(orgA)).toBe(1);
    } finally {
      holder.release();
      await holder.done;
    }
    await expect(blocked).resolves.toBe(true);
    const rows = await prisma.post.findMany({
      where: { id: { in: [postA, postB] }, isDeleted: false },
      select: { targetExecutionState: true },
    });
    expect(rows.map((row) => row.targetExecutionState)).toEqual([
      TargetExecutionState.PUBLISHED,
      TargetExecutionState.PUBLISHED,
    ]);
  });

  it('keeps same-organization readers and writers mutually exclusive', async () => {
    const reader = hold((tx) => learningOrgFence(tx, orgA, 'shared'));
    const entered: string[] = [];
    let writer: Promise<void> | undefined;
    try {
      await reader.held;
      await prisma.$transaction(async (tx) => {
        await learningOrgFence(tx, orgB, 'exclusive');
        entered.push('other-organization-writer');
      });
      writer = prisma.$transaction(async (tx) => {
        await learningOrgFence(tx, orgA, 'exclusive');
        entered.push('same-organization-writer');
      });
      await expect.poll(() => waitingFor(orgA)).toBe(1);
      expect(entered).toEqual(['other-organization-writer']);
    } finally {
      reader.release();
      await reader.done;
    }
    await writer;
    expect(entered).toEqual([
      'other-organization-writer',
      'same-organization-writer',
    ]);
  });

  it('lets the global exclusive fence exclude every organization fence', async () => {
    const organizationHolder = hold((tx) =>
      learningOrgFence(tx, orgB, 'shared'),
    );
    let global: Promise<void> | undefined;
    try {
      await organizationHolder.held;
      global = prisma.$transaction((tx) => learningFence(tx, 'exclusive'));
      await expect.poll(() => waitingForGlobal()).toBe(1);
    } finally {
      organizationHolder.release();
      await organizationHolder.done;
    }
    await global;
  });

  it('reruns a publish under the global fence when its invalidation reaches global learning state', async () => {
    const postA = await seedPost(orgA, brands.get(orgA) as string);
    const datasetId = randomUUID();
    const edge = await prisma.contentLearningDependency.create({
      data: {
        derivedId: datasetId,
        derivedKind: 'dataset',
        derivedOrganizationId: null,
        sourceId: postA,
        sourceKind: 'post',
        sourceOrganizationId: orgA,
        sourceVersion: 'fence-test',
      },
    });
    await expect(publish(orgA, postA)).resolves.toBe(true);
    const invalidated = await prisma.contentLearningDependency.findFirst({
      where: { id: edge.id, isDeleted: false },
      select: { valid: true },
    });
    expect(invalidated?.valid).toBe(false);
  });
});
