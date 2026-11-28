import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { OutlierLibraryService } from '@api/collections/outlier-library/services/outlier-library.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { Platform } from '@genfeedai/contracts';
import type { OutlierLibraryPostInput } from '@genfeedai/contracts/interfaces';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
// Share CI's explicitly provisioned verification DB; isolate the fixture in its
// own schema built from the real migration. Never use DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

const NOW = new Date('2026-11-28T12:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * DAY_MS);
}

function post(
  id: string,
  days: number,
  views: number,
  overrides: Partial<OutlierLibraryPostInput> = {},
): OutlierLibraryPostInput {
  return {
    externalId: id,
    // A normal post earns 5% of its views in likes.
    likes: Math.round(views * 0.05),
    publishedAt: daysAgo(days),
    url: `https://example.test/${id}`,
    views,
    ...overrides,
  };
}

/** Twenty ordinary posts of 1,000 views: the creator's typical post. */
function ordinaryPosts(prefix: string): OutlierLibraryPostInput[] {
  return Array.from({ length: 20 }, (_, index) =>
    post(`${prefix}-n${index}`, 6 + index, 1_000),
  );
}

describe.skipIf(!connectionString)(
  'outlier library store PostgreSQL (#11641)',
  () => {
    const schema = `outlier_library_${randomUUID().replaceAll('-', '')}`;
    let pool: Pool;
    let prisma: PrismaClient;
    let service: OutlierLibraryService;

    beforeAll(async () => {
      if (!connectionString) {
        throw new Error('Explicit disposable database required');
      }
      const url = new URL(connectionString);
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        url.pathname !== '/billing_scope_test'
      ) {
        throw new Error('Disposable local database required');
      }
      pool = new Pool({ connectionString });
      await pool.query(`CREATE SCHEMA "${schema}"`);
      const client = await pool.connect();
      try {
        await client.query(`SET search_path TO "${schema}"`);
        for (const name of [
          '20261128000000_outlier_library_store',
          '20261128010000_outlier_library_weekly_read',
          '20261128020000_outlier_library_retention',
        ]) {
          const sql = readFileSync(
            path.resolve(
              __dirname,
              `../../../../../../../packages/prisma/prisma/migrations/${name}/migration.sql`,
            ),
            'utf8',
          );
          // platform_settings is not part of this fixture.
          const cut = sql.indexOf('ALTER TABLE "platform_settings"');
          await client.query(cut === -1 ? sql : sql.slice(0, cut));
        }
      } finally {
        client.release();
      }
      url.searchParams.set('options', `-c search_path=${schema}`);
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
      });
      service = new OutlierLibraryService(prisma as unknown as PrismaService);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      if (pool) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool.end();
      }
    });

    it('keeps one creator row when two organizations ask for the same creator at once', async () => {
      const ids = await Promise.all(
        ['org-a', 'org-b'].map(() =>
          service.trackCreator({
            externalId: 'UC-shared',
            handle: 'shared',
            nicheTags: ['fitness'],
            platform: Platform.YOUTUBE,
          }),
        ),
      );
      await service.trackCreator({
        externalId: 'UC-shared',
        handle: 'shared',
        nicheTags: ['cooking'],
        platform: Platform.YOUTUBE,
      });

      expect(new Set(ids).size).toBe(1);
      const rows = await prisma.outlierCreator.findMany({
        where: { externalId: 'UC-shared', platform: Platform.YOUTUBE },
      });
      expect(rows).toHaveLength(1);
      expect([...rows[0].nicheTags].sort()).toEqual(['cooking', 'fitness']);
    });

    it('lists the outliers of two creators by multiple and leaves bought reach out', async () => {
      const first = await service.trackCreator({
        externalId: 'ig-first',
        handle: 'first',
        platform: Platform.INSTAGRAM,
      });
      const second = await service.trackCreator({
        externalId: 'yt-second',
        handle: 'second',
        platform: Platform.YOUTUBE,
      });

      const firstRead = await service.recordRead(
        first,
        [
          ...ordinaryPosts('first'),
          post('first-big', 3, 12_000),
          post('first-mid', 4, 4_000),
          post('first-near', 5, 1_500),
          // Paid for: the platform says so.
          post('first-promoted', 3, 90_000, { isPromoted: true }),
          // Paid for, unflagged: 30,000 views with 20 likes.
          post('first-bought', 4, 30_000, { likes: 20 }),
        ],
        NOW,
      );
      const secondRead = await service.recordRead(
        second,
        [...ordinaryPosts('second'), post('second-win', 3, 7_000)],
        NOW,
      );

      expect(firstRead).toMatchObject({
        listedCount: 2,
        medianViews: 1_000,
        status: 'ready',
      });
      expect(secondRead.listedCount).toBe(1);

      const listed = await service.listOutliers();
      expect(
        listed.map((row) => [
          row.externalId,
          row.outlierRatio,
          row.outlierTier,
        ]),
      ).toEqual([
        ['first-big', 12, 'breakout'],
        ['second-win', 7, 'outlier'],
        ['first-mid', 4, 'outlier'],
      ]);
      expect(listed[0]).toMatchObject({
        countsReadAt: NOW,
        creator: { handle: 'first' },
        medianViews: 1_000,
        platform: Platform.INSTAGRAM,
        url: 'https://example.test/first-big',
        views: 12_000,
      });

      expect(
        (await service.listOutliers({ platform: Platform.YOUTUBE })).map(
          (row) => row.externalId,
        ),
      ).toEqual(['second-win']);
      expect(
        (await service.listOutliers({ tier: 'breakout' })).map(
          (row) => row.externalId,
        ),
      ).toEqual(['first-big']);

      const secondPage = await service.listOutlierPage({ limit: 2, page: 2 });
      expect(secondPage).toMatchObject({ limit: 2, page: 2, totalDocs: 3 });
      expect(secondPage.docs.map((row) => row.externalId)).toEqual([
        'first-mid',
      ]);
      expect(
        await service.listOutlierPage({
          platform: Platform.YOUTUBE,
          tier: 'outlier',
        }),
      ).toMatchObject({ page: 1, totalDocs: 1 });
      const searched = await service.listOutlierPage({ search: 'SECOND' });
      expect(searched.docs.map((row) => row.externalId)).toEqual([
        'second-win',
      ]);
      expect(searched.totalDocs).toBe(1);
    });

    it('drops a post from the list when a later read no longer ranks it', async () => {
      const creator = await service.trackCreator({
        externalId: 'tt-drop',
        handle: 'drop',
        platform: Platform.TIKTOK,
      });
      await service.recordRead(
        creator,
        [...ordinaryPosts('drop'), post('drop-win', 3, 5_000)],
        NOW,
      );
      expect(
        (await service.listOutliers({ platform: Platform.TIKTOK })).map(
          (row) => row.externalId,
        ),
      ).toEqual(['drop-win']);

      await service.recordRead(
        creator,
        [...ordinaryPosts('drop'), post('drop-win', 3, 1_100)],
        daysAgo(-1),
      );

      expect(await service.listOutliers({ platform: Platform.TIKTOK })).toEqual(
        [],
      );
    });

    it('keeps the last good list when a read returns too few posts to know a typical one', async () => {
      const creator = await service.trackCreator({
        externalId: 'yt-thin',
        handle: 'thin',
        platform: Platform.YOUTUBE,
      });
      await service.recordRead(
        creator,
        [...ordinaryPosts('thin'), post('thin-win', 3, 6_000)],
        NOW,
      );

      const thin = await service.recordRead(creator, [], daysAgo(-7));

      expect(thin).toMatchObject({
        listedCount: 1,
        status: 'insufficient_data',
      });
      expect(
        (await service.listOutliers({ platform: Platform.YOUTUBE })).map(
          (row) => row.externalId,
        ),
      ).toContain('thin-win');
      const row = await prisma.outlierCreator.findUniqueOrThrow({
        where: { id: creator },
      });
      expect(row.medianViews).toBe(1_000);
      expect(row.lastReadAt).toEqual(daysAgo(-7));
    });

    it('never lists or reads a creator who asked to be removed, and does not reactivate them', async () => {
      const creator = await service.trackCreator({
        externalId: 'yt-gone',
        handle: 'gone',
        platform: Platform.YOUTUBE,
      });
      await service.recordRead(
        creator,
        [...ordinaryPosts('gone'), post('gone-win', 3, 9_000)],
        NOW,
      );
      await service.removeCreator({
        handle: 'gone',
        platform: Platform.YOUTUBE,
      });

      const again = await service.trackCreator({
        externalId: 'yt-gone',
        handle: 'gone',
        platform: Platform.YOUTUBE,
      });

      expect(again).toBe(creator);
      expect(
        (await service.listOutliers()).some(
          (row) => row.creator.id === creator,
        ),
      ).toBe(false);
      await expect(
        service.recordRead(creator, ordinaryPosts('gone'), NOW),
      ).rejects.toThrow('not tracked');
    });

    it('scrubs a removed creator to a block that holds no name, and blocks a creator never tracked', async () => {
      const creator = await service.trackCreator({
        displayName: 'Scrub Me',
        externalId: 'scrub-me',
        followersCount: 12_000,
        handle: 'Scrub_Me',
        platform: Platform.TIKTOK,
      });
      await service.recordRead(
        creator,
        [...ordinaryPosts('scrub'), post('scrub-win', 3, 9_000)],
        NOW,
      );

      await service.removeCreator({
        handle: '@scrub_me',
        platform: Platform.TIKTOK,
      });
      await service.removeCreator({
        handle: 'never-seen',
        platform: Platform.TIKTOK,
      });

      const row = await prisma.outlierCreator.findUniqueOrThrow({
        where: { id: creator },
      });
      expect(row).toMatchObject({
        displayName: null,
        followersCount: null,
        handle: 'removed',
        isDeleted: true,
        status: 'removed',
      });
      expect(JSON.stringify(row).toLowerCase()).not.toContain('scrub');
      expect(
        await prisma.outlierPost.count({ where: { creatorId: creator } }),
      ).toBe(0);
      const blockedAgain = await service.trackCreator({
        externalId: 'never-seen',
        handle: 'Never-Seen',
        platform: Platform.TIKTOK,
      });
      const blocked = await prisma.outlierCreator.findUniqueOrThrow({
        where: { id: blockedAgain },
      });
      expect(blocked.status).toBe('removed');
      expect(
        await prisma.outlierCreator.count({
          where: { externalId: 'never-seen' },
        }),
      ).toBe(0);
    });

    it('keeps a post one read misses and drops it when two reads in a row miss it', async () => {
      const creator = await service.trackCreator({
        externalId: 'misses',
        handle: 'misses',
        platform: Platform.TIKTOK,
      });
      const withWin = [
        ...ordinaryPosts('misses'),
        post('misses-win', 3, 9_000),
      ];
      await service.recordRead(creator, withWin, NOW);
      const listed = async () =>
        (await service.listOutliers({ platform: Platform.TIKTOK })).some(
          (row) => row.externalId === 'misses-win',
        );
      expect(await listed()).toBe(true);

      const without = ordinaryPosts('misses');
      await service.recordRead(creator, without, daysAgo(-7));
      expect(await listed()).toBe(true);
      await service.recordRead(creator, withWin, daysAgo(-14));
      expect(await listed()).toBe(true);

      await service.recordRead(creator, without, daysAgo(-21));
      await service.recordRead(creator, without, daysAgo(-28));
      expect(await listed()).toBe(false);
    });

    it('drops counts older than 30 days, hides a creator missed twice and deletes dropped posts for good', async () => {
      const stale = await service.trackCreator({
        externalId: 'retention-stale',
        handle: 'retention-stale',
        platform: Platform.TIKTOK,
      });
      const lost = await service.trackCreator({
        externalId: 'retention-lost',
        handle: 'retention-lost',
        platform: Platform.TIKTOK,
      });
      await service.recordRead(
        stale,
        [...ordinaryPosts('rs'), post('rs-win', 3, 9_000)],
        NOW,
      );
      await service.recordRead(
        lost,
        [...ordinaryPosts('rl'), post('rl-win', 3, 9_000)],
        daysAgo(-29),
      );
      await prisma.outlierCreator.update({
        data: { missedReads: 2 },
        where: { id: lost },
      });
      const listedIds = async () =>
        (await service.listOutliers({ platform: Platform.TIKTOK })).map(
          (row) => row.externalId,
        );

      const first = await service.enforceRetention(daysAgo(-31));
      expect(first).toMatchObject({ hiddenCreators: 1 });
      expect(first.staleCounts).toBeGreaterThanOrEqual(1);
      expect(await listedIds()).not.toContain('rs-win');
      expect(await listedIds()).not.toContain('rl-win');
      const hidden = await prisma.outlierCreator.findUniqueOrThrow({
        where: { id: lost },
      });
      expect(hidden.status).toBe('unreadable');

      const later = await service.enforceRetention(daysAgo(-40));
      expect(first.deletedPosts + later.deletedPosts).toBeGreaterThanOrEqual(2);
      expect(
        await prisma.outlierPost.count({
          where: { externalId: { in: ['rs-win', 'rl-win'] } },
        }),
      ).toBe(0);
    });
  },
);
