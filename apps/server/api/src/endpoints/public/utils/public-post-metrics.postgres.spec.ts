import { loadPublicPostMetrics } from '@api/endpoints/public/utils/public-post-metrics.util';
import { type Prisma, PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { afterAll, describe, expect, it, vi } from 'vitest';

/**
 * Reads public post metrics from a real, migrated PostgreSQL. It shares the
 * disposable database of the public posts order spec
 * (PUBLIC_POSTS_ORDER_TEST_DATABASE_URL, name starting `public_posts_order`);
 * every test runs in a transaction that is rolled back, with foreign keys
 * relaxed for its rows (`session_replication_role = replica`, which needs a
 * superuser).
 */
vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

const connectionString = process.env.PUBLIC_POSTS_ORDER_TEST_DATABASE_URL;
if (connectionString !== undefined) {
  let url: URL;
  try {
    url = new URL(connectionString);
  } catch {
    throw new Error('A disposable local public-posts database is required.');
  }
  if (
    !['postgres:', 'postgresql:'].includes(url.protocol) ||
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    !url.pathname.startsWith('/public_posts_order')
  ) {
    throw new Error('A disposable local public-posts database is required.');
  }
}

class RollbackSignal extends Error {}

interface AnalyticsSeed {
  date: string;
  engagementRate?: number;
  isDeleted?: boolean;
  postId: string;
  totalLikes: number;
  totalViews: number;
  totalViewsIncrement?: number;
}

describe.skipIf(!connectionString)(
  'public post metrics on real PostgreSQL',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;

    afterAll(async () => {
      await prisma?.$disconnect();
    });

    async function inRolledBackTransaction(
      work: (tx: Prisma.TransactionClient) => Promise<void>,
    ): Promise<void> {
      if (!prisma) {
        throw new Error('Public posts database is not configured.');
      }
      await prisma
        .$transaction(async (tx) => {
          await tx.$executeRaw`SET LOCAL session_replication_role = replica`;
          await work(tx);
          throw new RollbackSignal();
        })
        .catch((error: unknown) => {
          if (!(error instanceof RollbackSignal)) {
            throw error;
          }
        });
    }

    async function seed(
      tx: Prisma.TransactionClient,
      rows: AnalyticsSeed[],
    ): Promise<void> {
      for (const row of rows) {
        await tx.postAnalytics.create({
          data: {
            brandId: 'brand-1',
            date: new Date(row.date),
            engagementRate: row.engagementRate ?? 0,
            isDeleted: row.isDeleted ?? false,
            organizationId: 'org-1',
            platform: 'INSTAGRAM',
            postId: row.postId,
            totalLikes: row.totalLikes,
            totalViews: row.totalViews,
            totalViewsIncrement: row.totalViewsIncrement ?? 0,
            userId: 'user-1',
          },
        });
      }
    }

    it('returns the totals of the latest day, not an increment or an older day', async () => {
      await inRolledBackTransaction(async (tx) => {
        await seed(tx, [
          {
            date: '2026-11-25T00:00:00Z',
            engagementRate: 1,
            postId: 'post-a',
            totalLikes: 10,
            totalViews: 400,
          },
          {
            date: '2026-11-27T00:00:00Z',
            engagementRate: 4.5,
            postId: 'post-a',
            totalLikes: 90,
            totalViews: 2000,
            totalViewsIncrement: 150,
          },
          {
            date: '2026-11-26T00:00:00Z',
            engagementRate: 2,
            postId: 'post-a',
            totalLikes: 50,
            totalViews: 1200,
          },
          {
            date: '2026-11-26T00:00:00Z',
            postId: 'post-b',
            totalLikes: 3,
            totalViews: 77,
          },
        ]);

        const metrics = await loadPublicPostMetrics(tx, [
          { id: 'post-a' },
          { id: 'post-b' },
        ]);

        expect(metrics.get('post-a')).toEqual({
          avgEngagementRate: 4.5,
          totalComments: 0,
          totalLikes: 90,
          totalSaves: 0,
          totalShares: 0,
          totalViews: 2000,
        });
        expect(metrics.get('post-b')?.totalViews).toBe(77);
      });
    });

    it('ignores a deleted analytics row, even the newest', async () => {
      await inRolledBackTransaction(async (tx) => {
        await seed(tx, [
          {
            date: '2026-11-26T00:00:00Z',
            postId: 'post-a',
            totalLikes: 5,
            totalViews: 100,
          },
          {
            date: '2026-11-27T00:00:00Z',
            isDeleted: true,
            postId: 'post-a',
            totalLikes: 999,
            totalViews: 9999,
          },
        ]);

        const metrics = await loadPublicPostMetrics(tx, [{ id: 'post-a' }]);

        expect(metrics.get('post-a')?.totalViews).toBe(100);
      });
    });

    it('returns nothing for a post under a brand with Public analytics off', async () => {
      await inRolledBackTransaction(async (tx) => {
        await seed(tx, [
          {
            date: '2026-11-27T00:00:00Z',
            postId: 'post-a',
            totalLikes: 5,
            totalViews: 100,
          },
        ]);

        const metrics = await loadPublicPostMetrics(tx, [
          { brand: { isPublicAnalyticsEnabled: false }, id: 'post-a' },
        ]);

        expect(metrics.size).toBe(0);
      });
    });

    it('returns nothing for a post with no analytics row', async () => {
      await inRolledBackTransaction(async (tx) => {
        await seed(tx, [
          {
            date: '2026-11-27T00:00:00Z',
            postId: 'post-a',
            totalLikes: 5,
            totalViews: 100,
          },
        ]);

        const metrics = await loadPublicPostMetrics(tx, [
          { id: 'post-a' },
          { id: 'post-without-rows' },
        ]);

        expect([...metrics.keys()]).toEqual(['post-a']);
      });
    });
  },
);
