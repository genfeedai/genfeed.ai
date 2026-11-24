import { randomUUID } from 'node:crypto';
import { PublicBrandReachService } from '@api/endpoints/public/services/public-brand-reach.service';
import type { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { PrismaClient } from '@genfeedai/prisma';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');
// Share CI's explicitly provisioned verification DB; isolate the fixture in its
// own schema. Never use DATABASE_URL or production configuration.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

describe.skipIf(!connectionString)(
  'PublicBrandReachService against PostgreSQL',
  () => {
    const schema = `public_reach_${randomUUID().replaceAll('-', '')}`;
    let pool: Pool;
    let prisma: PrismaClient;
    let service: PublicBrandReachService;

    function snapshot(row: {
      date: string;
      impressions?: number | null;
      isDeleted?: boolean;
      organizationId?: string;
      platform: string;
      postId: string;
      brandId?: string;
      views: number;
      likes?: number;
      comments?: number;
      shares?: number;
      saves?: number;
    }) {
      return pool.query(
        `INSERT INTO "${schema}"."post_analytics" ("id","postId","organizationId","brandId","platform","date","totalViews","totalLikes","totalComments","totalShares","totalSaves","impressions","isDeleted") VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
        [
          randomUUID(),
          row.postId,
          row.organizationId ?? 'org-1',
          row.brandId ?? 'brand-1',
          row.platform,
          row.date,
          row.views,
          row.likes ?? 0,
          row.comments ?? 0,
          row.shares ?? 0,
          row.saves ?? 0,
          row.impressions ?? null,
          row.isDeleted ?? false,
        ],
      );
    }

    beforeAll(async () => {
      if (!connectionString)
        throw new Error('Explicit disposable database required');
      const url = new URL(connectionString);
      if (
        !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) ||
        !['/billing_scope_test', '/genfeed_6507_disposable'].includes(
          url.pathname,
        )
      )
        throw new Error('Disposable local database required');
      pool = new Pool({ connectionString });
      await pool.query(`CREATE SCHEMA "${schema}"`);
      await pool.query(
        `CREATE TABLE "${schema}"."posts" ("id" text PRIMARY KEY, "isDeleted" boolean NOT NULL DEFAULT false)`,
      );
      await pool.query(
        `CREATE TABLE "${schema}"."post_analytics" ("id" text PRIMARY KEY, "postId" text NOT NULL, "organizationId" text NOT NULL, "brandId" text NOT NULL, "platform" text NOT NULL, "date" timestamp(3) NOT NULL, "totalViews" integer NOT NULL DEFAULT 0, "totalLikes" integer NOT NULL DEFAULT 0, "totalComments" integer NOT NULL DEFAULT 0, "totalShares" integer NOT NULL DEFAULT 0, "totalSaves" integer NOT NULL DEFAULT 0, "impressions" integer, "isDeleted" boolean NOT NULL DEFAULT false)`,
      );
      await pool.query(
        `INSERT INTO "${schema}"."posts" ("id","isDeleted") VALUES ('p1',false),('p2',false),('p-gone',true)`,
      );
      url.searchParams.set('options', `-c search_path=${schema}`);
      prisma = new PrismaClient({
        adapter: new PrismaPg({ connectionString: url.toString() }, { schema }),
      });
      service = new PublicBrandReachService(prisma as unknown as PrismaService);
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      await pool?.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
      await pool?.end();
    });

    it('answers nothing to show for a brand without analytics', async () => {
      expect(await service.findForBrand('brand-1', 'org-1')).toEqual({
        engagements: 0,
        impressions: null,
        views: 0,
      });
    });

    it('counts each post and platform once, at its latest snapshot', async () => {
      // p1 on instagram grew over three days: only day 3 counts.
      await snapshot({
        date: '2026-11-01',
        platform: 'INSTAGRAM',
        postId: 'p1',
        views: 100,
        likes: 5,
        impressions: 400,
      });
      await snapshot({
        date: '2026-11-02',
        platform: 'INSTAGRAM',
        postId: 'p1',
        views: 250,
        likes: 9,
        impressions: 900,
      });
      await snapshot({
        date: '2026-11-03',
        platform: 'INSTAGRAM',
        postId: 'p1',
        views: 300,
        likes: 10,
        comments: 2,
        shares: 3,
        saves: 5,
        impressions: 1000,
      });
      // The same post cross-posted to tiktok adds its own total, without impressions.
      await snapshot({
        date: '2026-11-03',
        platform: 'TIKTOK',
        postId: 'p1',
        views: 700,
        likes: 40,
      });
      // A second post.
      await snapshot({
        date: '2026-11-03',
        platform: 'INSTAGRAM',
        postId: 'p2',
        views: 50,
        likes: 1,
        impressions: 200,
      });

      expect(await service.findForBrand('brand-1', 'org-1')).toEqual({
        // 10+2+3+5 + 40 + 1
        engagements: 61,
        impressions: 1200,
        views: 1050,
      });
    });

    it('leaves out deleted posts, deleted snapshots and other brands or organizations', async () => {
      await snapshot({
        date: '2026-11-03',
        platform: 'INSTAGRAM',
        postId: 'p-gone',
        views: 9999,
        likes: 999,
        impressions: 9999,
      });
      await snapshot({
        date: '2026-11-04',
        isDeleted: true,
        platform: 'INSTAGRAM',
        postId: 'p1',
        views: 77777,
      });
      await snapshot({
        brandId: 'brand-2',
        date: '2026-11-03',
        platform: 'INSTAGRAM',
        postId: 'p1',
        views: 5555,
      });
      await snapshot({
        date: '2026-11-03',
        organizationId: 'org-2',
        platform: 'INSTAGRAM',
        postId: 'p1',
        views: 4444,
      });

      expect(await service.findForBrand('brand-1', 'org-1')).toEqual({
        engagements: 61,
        impressions: 1200,
        views: 1050,
      });
    });
  },
);
