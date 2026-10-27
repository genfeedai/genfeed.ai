import { LeaderboardSort } from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { EntityLeaderboardService } from '@api/endpoints/analytics/entity-leaderboard.service';
import { Prisma } from '@genfeedai/prisma';
import { Client } from 'pg';

vi.unmock('@genfeedai/prisma');

const connectionString = process.env.ENTITY_LEADERBOARD_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (!['localhost', '127.0.0.1'].includes(url.hostname)) {
    throw new Error(
      'ENTITY_LEADERBOARD_TEST_DATABASE_URL must point at a local disposable database',
    );
  }
}

/**
 * The leaderboard counts and ranks posts in raw SQL, which a mocked
 * `$queryRaw` cannot prove. This runs the real statements against a
 * disposable local PostgreSQL with throwaway temp tables.
 */
describe.skipIf(!connectionString)(
  'organization leaderboard posts on PostgreSQL',
  () => {
    const client = new Client({ connectionString });
    let service: EntityLeaderboardService;

    beforeAll(async () => {
      await client.connect();
      await client.query(`
        CREATE TEMP TABLE organizations (
          id text, label text, "isDeleted" boolean DEFAULT false, "createdAt" timestamp DEFAULT now()
        );
        CREATE TEMP TABLE posts (
          id text, "organizationId" text, "brandId" text, "isDeleted" boolean DEFAULT false,
          "publishedAt" timestamp
        );
        CREATE TEMP TABLE post_analytics (
          id text, "postId" text, "organizationId" text, "brandId" text, date timestamp,
          "totalViews" integer, "totalLikes" integer, "totalComments" integer,
          "totalShares" integer, "totalSaves" integer, "engagementRate" double precision
        );
        INSERT INTO organizations (id, label, "createdAt") VALUES
          ('busy', 'Busy', '2026-01-01'),
          ('unsynced', 'Unsynced', '2026-02-01'),
          ('newest', 'Newest', '2026-03-01');
        -- Three posts published in the window, one of them deleted, one outside it.
        INSERT INTO posts (id, "organizationId", "brandId", "isDeleted", "publishedAt") VALUES
          ('b1', 'busy', 'brand-b', false, '2026-10-21'),
          ('b2', 'busy', 'brand-b', false, '2026-10-22'),
          ('b3', 'busy', 'brand-b', true, '2026-10-22'),
          ('b4', 'busy', 'brand-b', false, '2026-09-01'),
          ('u1', 'unsynced', 'brand-u', false, '2026-10-23');
        -- Only one of busy's posts has been synced; "unsynced" has no analytics rows.
        INSERT INTO post_analytics VALUES
          ('m1', 'b1', 'busy', 'brand-b', '2026-10-22', 100, 10, 2, 1, 0, 13);
      `);

      const prisma = {
        $queryRaw: async (...args: Parameters<typeof Prisma.sql>) => {
          const query = Prisma.sql(...args);
          return (await client.query(query.text, query.values)).rows;
        },
      };
      const organizationsService = {
        findAll: async (query: { where: { id: { in: string[] } } }) => ({
          docs: query.where.id.in.map((id) => ({ id, label: id })),
        }),
      };

      service = new EntityLeaderboardService(
        prisma as never,
        organizationsService as never,
        {} as never,
        {} as never,
      );
    });

    afterAll(async () => {
      await client.end();
    });

    it('counts published posts in the window even when no analytics were synced', async () => {
      const leaderboard = await service.getOrganizationsLeaderboard(
        '2026-10-20',
        '2026-10-26',
        LeaderboardSort.POSTS,
        10,
      );

      expect(
        leaderboard.map(({ organization, totalPosts }) => [
          organization.id,
          totalPosts,
        ]),
      ).toEqual([
        ['busy', 2],
        ['unsynced', 1],
        ['newest', 0],
      ]);
    });

    it('keeps views and engagement on the synced analytics rows', async () => {
      const leaderboard = await service.getOrganizationsLeaderboard(
        '2026-10-20',
        '2026-10-26',
        LeaderboardSort.VIEWS,
        10,
      );

      const busy = leaderboard.find(
        ({ organization }) => organization.id === 'busy',
      );
      expect(leaderboard[0]?.organization.id).toBe('busy');
      expect(busy).toMatchObject({
        totalEngagement: 13,
        totalPosts: 2,
        totalViews: 100,
      });
    });
  },
);
