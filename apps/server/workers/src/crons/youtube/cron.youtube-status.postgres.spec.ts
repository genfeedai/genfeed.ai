import { randomUUID } from 'node:crypto';
import { PostsService } from '@api/collections/posts/services/posts.service';
import { CredentialPlatform } from '@genfeedai/contracts';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { CronYoutubeStatusService } from '@workers/crons/youtube/cron.youtube-status.service';
import { YOUTUBE_MAINTENANCE_ACTION_IDS } from '@workers/crons/youtube/youtube-maintenance-workflow-definition';
import { createFixtureTables } from '@workers/testing/schema-fixture-tables';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: a disposable loopback database, never production.
const connection = process.env.WORKFLOW_BILLING_TEST_DATABASE_URL;

type DiscoverAction = (request: {
  input: { request: Record<string, unknown> };
}) => Promise<{
  items: Array<{ postId: string; finalizationPending: boolean }>;
}>;

/**
 * The YouTube status sweep against real PostgreSQL rows: which posts the
 * sweep hands to reconciliation (#10393).
 */
describe.skipIf(!connection)(
  'YouTube status sweep discovery (PostgreSQL)',
  () => {
    const schema = `youtube_sweep_${randomUUID().replaceAll('-', '')}`;
    const now = new Date('2026-11-16T01:00:00.000Z');
    const daysAgo = (days: number) =>
      new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    let pool: Pool;
    let prisma: PrismaClient;
    let discover: DiscoverAction;

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
          new Set(['Post', 'PostPublishFinalization', 'Credential']),
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
      const actions = new Map<string, DiscoverAction>();
      const logger = {
        debug: vi.fn(),
        error: vi.fn(),
        log: vi.fn(),
        warn: vi.fn(),
      };
      const posts = new PostsService(
        prisma as never,
        logger as never,
        {} as never,
      );
      const service = new CronYoutubeStatusService(
        logger as never,
        posts,
        {} as never,
        {
          registerAction: (id: string, action: DiscoverAction) =>
            actions.set(id, action),
          registerWorkflow: vi.fn(),
        } as never,
        {} as never,
        {} as never,
        {} as never,
        {} as never,
      );
      service.onModuleInit();
      const action = actions.get(YOUTUBE_MAINTENANCE_ACTION_IDS.DISCOVER_POSTS);
      if (!action) throw new Error('discover action was not registered');
      discover = action;
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      await pool?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool?.end();
    });

    async function seedPost(fields: {
      createdAt: Date;
      externalId?: string | null;
      isDeleted?: boolean;
      platform?: string;
      status?: string;
      targetExecutionState: string;
      visibility?: string | null;
    }): Promise<string> {
      const id = randomUUID();
      await pool.query(
        `INSERT INTO "${schema}"."posts"
        ("id","userId","organizationId","brandId","description","platform","externalId","status","visibility","targetExecutionState","isDeleted","createdAt","updatedAt")
       VALUES ($1,$2,$3,$4,'fixture',$5,$6,$7,$8,$9,$10,$11,$11)`,
        [
          id,
          'user',
          'org',
          'brand',
          fields.platform ?? CredentialPlatform.YOUTUBE,
          fields.externalId === undefined ? `video-${id}` : fields.externalId,
          fields.status ?? 'processing',
          fields.visibility ?? null,
          fields.targetExecutionState,
          fields.isDeleted ?? false,
          fields.createdAt,
        ],
      );
      return id;
    }

    async function discoveredIds(): Promise<string[]> {
      const result = await discover({
        input: { request: { now: now.toISOString() } },
      });
      return result.items.map((item) => item.postId);
    }

    it('picks up a post that has been publishing for more than seven days', async () => {
      const stuck = await seedPost({
        createdAt: daysAgo(8),
        targetExecutionState: 'publishing',
      });
      const recent = await seedPost({
        createdAt: daysAgo(1),
        targetExecutionState: 'publishing',
      });

      const ids = await discoveredIds();

      expect(ids).toContain(stuck);
      expect(ids).toContain(recent);
    });

    it('leaves out posts that are settled, deleted, not on YouTube or without a provider id', async () => {
      const settledOld = await seedPost({
        createdAt: daysAgo(30),
        targetExecutionState: 'published',
        visibility: 'public',
      });
      const privateOld = await seedPost({
        createdAt: daysAgo(30),
        targetExecutionState: 'published',
        visibility: 'private',
      });
      const deleted = await seedPost({
        createdAt: daysAgo(30),
        isDeleted: true,
        targetExecutionState: 'publishing',
      });
      const otherPlatform = await seedPost({
        createdAt: daysAgo(30),
        platform: 'tiktok',
        targetExecutionState: 'publishing',
      });
      const noProviderId = await seedPost({
        createdAt: daysAgo(30),
        externalId: null,
        targetExecutionState: 'publishing',
      });
      const recentPrivate = await seedPost({
        createdAt: daysAgo(2),
        targetExecutionState: 'published',
        visibility: 'private',
      });

      const ids = await discoveredIds();

      expect(ids).toContain(recentPrivate);
      expect(ids).not.toContain(settledOld);
      expect(ids).not.toContain(privateOld);
      expect(ids).not.toContain(deleted);
      expect(ids).not.toContain(otherPlatform);
      expect(ids).not.toContain(noProviderId);
    });
  },
);
