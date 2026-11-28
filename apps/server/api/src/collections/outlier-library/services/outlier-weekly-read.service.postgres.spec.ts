import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { startOfReadWeek } from '@api/collections/outlier-library/outlier-library-weekly-read.constants';
import { OutlierLibraryService } from '@api/collections/outlier-library/services/outlier-library.service';
import { OutlierReadClaimService } from '@api/collections/outlier-library/services/outlier-read-claim.service';
import { OutlierWeeklyReadService } from '@api/collections/outlier-library/services/outlier-weekly-read.service';
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
// own schema built from the real migrations. Never use DATABASE_URL.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

const WEDNESDAY = new Date('2026-11-25T10:00:00.000Z');
const NEXT_TUESDAY = new Date('2026-12-01T10:00:00.000Z');
const DAY_MS = 24 * 60 * 60 * 1000;
const LEASE_MS = 20 * 60 * 1000;

function posts(prefix: string, now: Date, winnerViews?: number) {
  const list: OutlierLibraryPostInput[] = Array.from(
    { length: 20 },
    (_, index) => ({
      externalId: `${prefix}-n${index}`,
      likes: 50,
      publishedAt: new Date(now.getTime() - (6 + index) * DAY_MS),
      url: `https://example.test/${prefix}-n${index}`,
      views: 1_000,
    }),
  );
  if (winnerViews) {
    list.push({
      externalId: `${prefix}-win`,
      likes: Math.round(winnerViews * 0.05),
      publishedAt: new Date(now.getTime() - 3 * DAY_MS),
      url: `https://example.test/${prefix}-win`,
      views: winnerViews,
    });
  }
  return list;
}

describe.skipIf(!connectionString)(
  'outlier library weekly read PostgreSQL (#11642)',
  () => {
    const schema = `outlier_read_${randomUUID().replaceAll('-', '')}`;
    let pool: Pool;
    let prisma: PrismaClient;
    let library: OutlierLibraryService;
    let claims: OutlierReadClaimService;
    const reads = new Map<string, () => OutlierLibraryPostInput[]>();
    const readCalls: string[] = [];
    const logger = { error: vi.fn(), log: vi.fn(), warn: vi.fn() };
    let weeklyRead: OutlierWeeklyReadService;

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
        ]) {
          let sql = readFileSync(
            path.resolve(
              __dirname,
              `../../../../../../../packages/prisma/prisma/migrations/${name}/migration.sql`,
            ),
            'utf8',
          );
          if (name.endsWith('weekly_read')) {
            // platform_settings is not part of this fixture.
            sql = sql.slice(0, sql.indexOf('ALTER TABLE "platform_settings"'));
          }
          await client.query(sql);
        }
      } finally {
        client.release();
      }
      url.searchParams.set('options', `-c search_path=${schema}`);
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
      });
      const db = prisma as unknown as PrismaService;
      library = new OutlierLibraryService(db);
      claims = new OutlierReadClaimService(db);
      weeklyRead = new OutlierWeeklyReadService(
        claims,
        library,
        {
          canRead: async (platform: string) => platform === Platform.TIKTOK,
          read: async (creator: { handle: string }) => {
            readCalls.push(creator.handle);
            const read = reads.get(creator.handle);
            if (!read) throw new Error('scraper failed');
            return read();
          },
        } as never,
        {
          seedFromNicheList: async () => 0,
          seedFromTrendingVideos: async () => 0,
        } as never,
        logger as never,
      );
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      if (pool) {
        await pool.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
        await pool.end();
      }
    });

    async function track(handle: string): Promise<string> {
      return library.trackCreator({
        externalId: handle,
        handle,
        platform: Platform.TIKTOK,
      });
    }

    it('reads each tracked creator once a week, however often the job runs', async () => {
      await track('weekly-a');
      await track('weekly-b');
      reads.set('weekly-a', () => posts('weekly-a', WEDNESDAY));
      reads.set('weekly-b', () => posts('weekly-b', WEDNESDAY));
      readCalls.length = 0;

      const first = await weeklyRead.run(WEDNESDAY);
      const second = await weeklyRead.run(
        new Date(WEDNESDAY.getTime() + DAY_MS),
      );
      expect(first[0]).toMatchObject({ attempted: 2, read: 2 });
      expect(second[0]).toMatchObject({ attempted: 0, read: 0 });
      expect(readCalls.sort()).toEqual(['weekly-a', 'weekly-b']);

      const nextWeek = await weeklyRead.run(NEXT_TUESDAY);
      expect(nextWeek[0]).toMatchObject({ attempted: 2, read: 2 });
      expect(readCalls).toHaveLength(4);
    });

    it('keeps the last good numbers when a later read comes back empty, and says so', async () => {
      const id = await track('empty-later');
      reads.set('empty-later', () => posts('empty-later', WEDNESDAY, 9_000));
      await weeklyRead.run(WEDNESDAY);
      const listed = await library.listOutliers({ platform: Platform.TIKTOK });
      expect(
        listed.some((row) => row.creator.id === id && row.views === 9_000),
      ).toBe(true);

      reads.set('empty-later', () => []);
      logger.error.mockClear();
      await weeklyRead.run(NEXT_TUESDAY);

      const still = await library.listOutliers({ platform: Platform.TIKTOK });
      expect(
        still.some((row) => row.creator.id === id && row.views === 9_000),
      ).toBe(true);
      const creator = await prisma.outlierCreator.findUniqueOrThrow({
        where: { id },
      });
      expect(creator.missedReads).toBe(1);
      expect(creator.lastReadAt?.getTime()).toBe(WEDNESDAY.getTime());
    });

    it('counts a failed read as a miss and still reads the others', async () => {
      const failing = await track('fails-once');
      const fine = await track('reads-fine');
      reads.delete('fails-once');
      reads.set('reads-fine', () => posts('reads-fine', NEXT_TUESDAY));

      const totals = await weeklyRead.run(
        new Date(NEXT_TUESDAY.getTime() + 8 * DAY_MS),
      );

      expect(totals[0]?.missed).toBeGreaterThanOrEqual(1);
      const failed = await prisma.outlierCreator.findUniqueOrThrow({
        where: { id: failing },
      });
      const succeeded = await prisma.outlierCreator.findUniqueOrThrow({
        where: { id: fine },
      });
      expect(failed.missedReads).toBe(1);
      expect(failed.readClaimId).toBeNull();
      expect(succeeded.missedReads).toBe(0);
      expect(succeeded.lastReadAt).not.toBeNull();
    });

    it('stops at the weekly budget and leaves the rest due, oldest first', async () => {
      const ids = [
        await track('cap-1'),
        await track('cap-2'),
        await track('cap-3'),
      ];
      const week = new Date('2027-01-13T10:00:00.000Z');
      await prisma.outlierCreator.updateMany({
        data: { lastReadAttemptAt: week },
        where: { id: { notIn: ids } },
      });
      const taken: string[] = [];
      for (let index = 0; index < 3; index += 1) {
        const claimed = await claims.claimNext(Platform.TIKTOK, {
          cap: 2,
          claimId: `claim-${index}`,
          leaseMs: LEASE_MS,
          now: week,
        });
        if (claimed) taken.push(claimed.id);
      }

      expect(taken).toHaveLength(2);
      const budget = await prisma.outlierReadBudget.findFirstOrThrow({
        where: { platform: Platform.TIKTOK, weekStart: startOfReadWeek(week) },
      });
      expect(budget.claimed).toBe(2);
      const third = await prisma.outlierCreator.findFirstOrThrow({
        where: { id: { in: ids.filter((id) => !taken.includes(id)) } },
      });
      expect(third.readClaimId).toBeNull();
    });

    it('lets another worker take a creator whose claim ran out', async () => {
      const id = await track('lease-lapsed');
      const week = new Date('2027-02-10T10:00:00.000Z');
      await prisma.outlierCreator.updateMany({
        data: { lastReadAttemptAt: week },
        where: { id: { not: id } },
      });
      const first = await claims.claimNext(Platform.TIKTOK, {
        cap: 5,
        claimId: 'worker-1',
        leaseMs: LEASE_MS,
        now: week,
      });
      const during = await claims.claimNext(Platform.TIKTOK, {
        cap: 5,
        claimId: 'worker-2',
        leaseMs: LEASE_MS,
        now: new Date(week.getTime() + LEASE_MS - 1),
      });
      const after = await claims.claimNext(Platform.TIKTOK, {
        cap: 5,
        claimId: 'worker-2',
        leaseMs: LEASE_MS,
        now: new Date(week.getTime() + LEASE_MS + 1),
      });

      expect(first?.id).toBe(id);
      expect(during).toBeNull();
      expect(after?.id).toBe(id);
      expect(
        await claims.complete(id, 'worker-1', { missed: false }, week),
      ).toBe(false);
      expect(
        await claims.complete(id, 'worker-2', { missed: false }, week),
      ).toBe(true);
    });
  },
);
