import { randomUUID } from 'node:crypto';
import { AnalyticsAggregationService } from '@api/collections/posts/services/analytics-aggregation.service';
import type { TopContent } from '@api/collections/posts/services/analytics-aggregation.types';
import type { PostsService } from '@api/collections/posts/services/posts.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AnalyticsMetric, Platform } from '@genfeedai/contracts';
import {
  CredentialPlatform,
  type Prisma,
  PrismaClient,
} from '@genfeedai/prisma';
import type { ConfigService } from '@libs/config/config.service';
import { runWithTenantContext } from '@libs/prisma/tenant-context';
import { PrismaPg } from '@prisma/adapter-pg';
import {
  afterAll,
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest';

vi.unmock('@genfeedai/prisma');
vi.unmock('@prisma/adapter-pg');

// Explicit opt-in only: use an isolated migrated database, never DATABASE_URL.
// CI's `Test API` job provisions and migrates this database on every shard
// (see the "Provision billing-account-scope and credit-balance test databases"
// step in .github/workflows/ci.yml), so this suite runs there for real. Every
// test seeds its own organizations with random ids, so it shares the database
// safely with the other *.postgres.spec.ts suites.
const connectionString = process.env.BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL;

// A fixed, fully past window: `DateRangeUtil.parseDateRange` clamps the end
// date to yesterday, so the window must not reach today.
const WINDOW_START = '2026-03-02';
const WINDOW_END = '2026-03-08';
const START_OF_WINDOW = new Date('2026-03-02T00:00:00.000Z');
const END_OF_WINDOW = new Date('2026-03-08T23:59:59.999Z');
const MID_WINDOW = new Date('2026-03-05T00:00:00.000Z');

const day = (isoDate: string): Date => new Date(`${isoDate}T00:00:00.000Z`);

const ranked = (rows: TopContent[]) =>
  rows.map(({ comments, likes, postId, saves, shares, totalEngagement }) => ({
    comments,
    likes,
    postId,
    saves,
    shares,
    totalEngagement,
  }));

/**
 * Real Postgres coverage for the top-content SQL introduced by #5575
 * (genfeedai/genfeed.ai#5449): `getTopPerformingContent` ranks posts in SQL by
 * the sum of per-post MAX(total*) — likes + comments + shares + saves — scoped
 * to the organization, live rows, an optional brand, and an inclusive date
 * window. The unit spec only exercises a mocked `$queryRaw`; this suite runs
 * the actual statement through the real `$extends`-wrapped `PrismaService`
 * (GENFEED_CLOUD=1, runtime tenant guard on) against migrated Postgres.
 */
describe.skipIf(!connectionString)(
  'AnalyticsAggregationService top content PostgreSQL end-to-end (#5575)',
  () => {
    const prisma = connectionString
      ? new PrismaClient({ adapter: new PrismaPg({ connectionString }) })
      : null;
    const database = () => {
      if (!prisma) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      return prisma;
    };

    const configService = {
      get: (key: string) =>
        ({ DATABASE_URL: connectionString, GENFEED_CLOUD: '1' })[
          key as 'DATABASE_URL' | 'GENFEED_CLOUD'
        ],
      mediaUrlConfig: { cdnUrl: 'https://cdn.test' },
    } as unknown as ConfigService;
    // Built only when the database is configured: vitest still runs a
    // skipped suite's body to collect it, and PrismaService throws without a
    // DATABASE_URL, which would fail the file instead of skipping it.
    const guardedPrisma = connectionString
      ? new PrismaService(configService)
      : null;
    // getTopPerformingContent never touches PostsService.
    const service = guardedPrisma
      ? new AnalyticsAggregationService(guardedPrisma, {} as PostsService)
      : null;
    const aggregation = () => {
      if (!service) {
        throw new Error('BILLING_ACCOUNT_SCOPE_TEST_DATABASE_URL is required');
      }
      return service;
    };

    let suffix: string;
    let userId: string;
    let organizationId: string;
    let otherOrganizationId: string;
    let brandId: string;
    let secondBrandId: string;
    let otherOrganizationBrandId: string;
    const organizationByBrand = new Map<string, string>();

    const postId = (name: string) => `tc-pg-${suffix}-${name}`;

    const seedPost = async (name: string, postBrandId: string = brandId) => {
      const id = postId(name);
      const postOrganizationId = organizationByBrand.get(postBrandId);
      if (!postOrganizationId) {
        throw new Error(`Unknown brand ${postBrandId}`);
      }
      await database().post.create({
        data: {
          brandId: postBrandId,
          description: `${name} description`,
          id,
          label: `${name} title`,
          organizationId: postOrganizationId,
          userId,
        },
      });
      return id;
    };

    const seedAnalytics = async (
      rows: Array<
        Omit<
          Prisma.PostAnalyticsCreateManyInput,
          'brandId' | 'organizationId' | 'platform' | 'userId'
        >
      >,
    ) => {
      const db = database();
      const posts = await db.post.findMany({
        select: { brandId: true, id: true, organizationId: true },
        where: { id: { in: rows.map((row) => row.postId) } },
      });
      const postById = new Map(posts.map((post) => [post.id, post]));

      await db.postAnalytics.createMany({
        data: rows.map((row) => {
          const post = postById.get(row.postId);
          if (!post) {
            throw new Error(
              `Seed the post before its analytics: ${row.postId}`,
            );
          }
          return {
            ...row,
            brandId: post.brandId,
            organizationId: post.organizationId,
            platform: CredentialPlatform.INSTAGRAM,
            userId,
          };
        }),
      });
    };

    const topContent = (
      scopeOrganizationId: string,
      scopeBrandId?: string,
      limit = 10,
      metric:
        | AnalyticsMetric.ENGAGEMENT
        | AnalyticsMetric.VIEWS = AnalyticsMetric.ENGAGEMENT,
    ) =>
      runWithTenantContext({ organizationId: scopeOrganizationId }, () =>
        aggregation().getTopPerformingContent(
          scopeOrganizationId,
          scopeBrandId,
          limit,
          metric,
          WINDOW_START,
          WINDOW_END,
        ),
      );

    beforeEach(async () => {
      suffix = randomUUID();
      userId = `tc-pg-user-${suffix}`;
      organizationId = `tc-pg-org-${suffix}`;
      otherOrganizationId = `tc-pg-org-other-${suffix}`;
      brandId = `tc-pg-brand-a-${suffix}`;
      secondBrandId = `tc-pg-brand-b-${suffix}`;
      otherOrganizationBrandId = `tc-pg-brand-other-${suffix}`;

      organizationByBrand.clear();
      organizationByBrand.set(brandId, organizationId);
      organizationByBrand.set(secondBrandId, organizationId);
      organizationByBrand.set(otherOrganizationBrandId, otherOrganizationId);

      const db = database();
      await db.user.create({ data: { handle: userId, id: userId } });
      for (const id of [organizationId, otherOrganizationId]) {
        await db.organization.create({
          data: { id, label: id, slug: id, userId },
        });
      }
      for (const [id, brandOrganizationId] of organizationByBrand) {
        await db.brand.create({
          data: {
            id,
            label: id,
            organizationId: brandOrganizationId,
            slug: id,
            userId,
          },
        });
      }
    });

    afterEach(async () => {
      const db = database();
      const organizationIds = [organizationId, otherOrganizationId];
      await db.postAnalytics.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.post.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.brand.deleteMany({
        where: { organizationId: { in: organizationIds } },
      });
      await db.organization.deleteMany({
        where: { id: { in: organizationIds } },
      });
      await db.user.deleteMany({ where: { id: userId } });
    });

    afterAll(async () => {
      await prisma?.$disconnect();
      await guardedPrisma?.$disconnect();
    });

    it('ranks by likes + comments + shares + saves, so a save-heavy post outranks a like-heavy one', async () => {
      const likeHeavy = await seedPost('like-heavy');
      const saveHeavy = await seedPost('save-heavy');
      const mixed = await seedPost('mixed');
      await seedAnalytics([
        { date: MID_WINDOW, postId: likeHeavy, totalLikes: 100 },
        {
          date: MID_WINDOW,
          postId: saveHeavy,
          totalLikes: 10,
          totalSaves: 200,
        },
        {
          date: MID_WINDOW,
          postId: mixed,
          totalComments: 20,
          totalLikes: 50,
          totalSaves: 5,
          totalShares: 10,
        },
      ]);

      const result = await topContent(organizationId);

      expect(ranked(result)).toEqual([
        {
          comments: 0,
          likes: 10,
          postId: saveHeavy,
          saves: 200,
          shares: 0,
          totalEngagement: 210,
        },
        {
          comments: 0,
          likes: 100,
          postId: likeHeavy,
          saves: 0,
          shares: 0,
          totalEngagement: 100,
        },
        {
          comments: 20,
          likes: 50,
          postId: mixed,
          saves: 5,
          shares: 10,
          totalEngagement: 85,
        },
      ]);
      // The post details come from the same tenant-scoped read.
      expect(result[0]).toMatchObject({
        platform: Platform.INSTAGRAM,
        title: 'save-heavy title',
      });
    });

    it('takes MAX per post over the window, not the SUM of its daily snapshot rows', async () => {
      const cumulative = await seedPost('cumulative');
      const single = await seedPost('single');
      await seedAnalytics([
        {
          date: day('2026-03-03'),
          postId: cumulative,
          totalLikes: 30,
          totalSaves: 10,
        },
        {
          date: day('2026-03-04'),
          postId: cumulative,
          totalLikes: 40,
          totalSaves: 20,
        },
        {
          date: day('2026-03-05'),
          postId: cumulative,
          totalLikes: 35,
          totalSaves: 25,
        },
        { date: day('2026-03-05'), postId: single, totalLikes: 100 },
      ]);

      // Summing the three daily rows would score `cumulative` 160 and rank it
      // first; the column-wise MAX scores it 40 + 25 = 65.
      expect(ranked(await topContent(organizationId))).toEqual([
        {
          comments: 0,
          likes: 100,
          postId: single,
          saves: 0,
          shares: 0,
          totalEngagement: 100,
        },
        {
          comments: 0,
          likes: 40,
          postId: cumulative,
          saves: 25,
          shares: 0,
          totalEngagement: 65,
        },
      ]);
    });

    it("never returns another organization's rows, however engaged", async () => {
      const own = await seedPost('own');
      const foreign = await seedPost('foreign', otherOrganizationBrandId);
      await seedAnalytics([
        { date: MID_WINDOW, postId: own, totalLikes: 5 },
        {
          date: MID_WINDOW,
          postId: foreign,
          totalLikes: 10_000,
          totalSaves: 10_000,
        },
      ]);

      expect(ranked(await topContent(organizationId))).toEqual([
        {
          comments: 0,
          likes: 5,
          postId: own,
          saves: 0,
          shares: 0,
          totalEngagement: 5,
        },
      ]);
      expect(
        (await topContent(otherOrganizationId)).map((row) => row.postId),
      ).toEqual([foreign]);
    });

    it('excludes soft-deleted analytics rows', async () => {
      const partlyDeleted = await seedPost('partly-deleted');
      const fullyDeleted = await seedPost('fully-deleted');
      await seedAnalytics([
        {
          date: day('2026-03-03'),
          isDeleted: true,
          postId: partlyDeleted,
          totalLikes: 9_000,
          totalSaves: 9_000,
        },
        {
          date: day('2026-03-04'),
          postId: partlyDeleted,
          totalLikes: 7,
          totalSaves: 3,
        },
        {
          date: day('2026-03-04'),
          isDeleted: true,
          postId: fullyDeleted,
          totalLikes: 50_000,
        },
      ]);

      expect(ranked(await topContent(organizationId))).toEqual([
        {
          comments: 0,
          likes: 7,
          postId: partlyDeleted,
          saves: 3,
          shares: 0,
          totalEngagement: 10,
        },
      ]);
    });

    it('with a brand filter returns only that brand and never leaks another brand', async () => {
      const brandPost = await seedPost('brand-a');
      const secondBrandPost = await seedPost('brand-b', secondBrandId);
      const foreignPost = await seedPost('foreign', otherOrganizationBrandId);
      await seedAnalytics([
        { date: MID_WINDOW, postId: brandPost, totalLikes: 1, totalSaves: 1 },
        { date: MID_WINDOW, postId: secondBrandPost, totalSaves: 500 },
        { date: MID_WINDOW, postId: foreignPost, totalSaves: 900 },
      ]);

      expect(ranked(await topContent(organizationId, brandId))).toEqual([
        {
          comments: 0,
          likes: 1,
          postId: brandPost,
          saves: 1,
          shares: 0,
          totalEngagement: 2,
        },
      ]);
      expect(
        (await topContent(organizationId, secondBrandId)).map(
          (row) => row.postId,
        ),
      ).toEqual([secondBrandPost]);
      // Without a brand, both of the organization's brands are ranked.
      expect(
        (await topContent(organizationId)).map((row) => row.postId),
      ).toEqual([secondBrandPost, brandPost]);
      // Another organization's brand id cannot widen the organization scope.
      await expect(
        topContent(organizationId, otherOrganizationBrandId),
      ).resolves.toEqual([]);
    });

    it('treats the date window as inclusive on both ends', async () => {
      const atStart = await seedPost('at-start');
      const atEnd = await seedPost('at-end');
      const beforeStart = await seedPost('before-start');
      const afterEnd = await seedPost('after-end');
      const straddling = await seedPost('straddling');
      await seedAnalytics([
        { date: START_OF_WINDOW, postId: atStart, totalLikes: 20 },
        { date: END_OF_WINDOW, postId: atEnd, totalLikes: 10 },
        {
          date: new Date(START_OF_WINDOW.getTime() - 1),
          postId: beforeStart,
          totalLikes: 1_000,
        },
        {
          date: new Date(END_OF_WINDOW.getTime() + 1),
          postId: afterEnd,
          totalLikes: 1_000,
        },
        // Only the in-window snapshot counts toward a post's MAX.
        { date: day('2026-02-20'), postId: straddling, totalLikes: 5_000 },
        { date: MID_WINDOW, postId: straddling, totalLikes: 15 },
        { date: day('2026-03-20'), postId: straddling, totalLikes: 6_000 },
      ]);

      expect(ranked(await topContent(organizationId))).toEqual([
        {
          comments: 0,
          likes: 20,
          postId: atStart,
          saves: 0,
          shares: 0,
          totalEngagement: 20,
        },
        {
          comments: 0,
          likes: 15,
          postId: straddling,
          saves: 0,
          shares: 0,
          totalEngagement: 15,
        },
        {
          comments: 0,
          likes: 10,
          postId: atEnd,
          saves: 0,
          shares: 0,
          totalEngagement: 10,
        },
      ]);
    });

    it('applies LIMIT after ranking and breaks engagement ties by postId ascending', async () => {
      // Seeded out of id order so insertion order cannot pass for the tie-break.
      const tieC = await seedPost('tie-c');
      const leader = await seedPost('leader');
      const tieA = await seedPost('tie-a');
      const tieB = await seedPost('tie-b');
      await seedAnalytics([
        { date: MID_WINDOW, postId: tieC, totalLikes: 30, totalSaves: 20 },
        { date: MID_WINDOW, postId: leader, totalSaves: 90 },
        { date: MID_WINDOW, postId: tieA, totalComments: 50 },
        { date: MID_WINDOW, postId: tieB, totalShares: 25, totalSaves: 25 },
      ]);

      expect(ranked(await topContent(organizationId, undefined, 3))).toEqual([
        {
          comments: 0,
          likes: 0,
          postId: leader,
          saves: 90,
          shares: 0,
          totalEngagement: 90,
        },
        {
          comments: 50,
          likes: 0,
          postId: tieA,
          saves: 0,
          shares: 0,
          totalEngagement: 50,
        },
        {
          comments: 0,
          likes: 0,
          postId: tieB,
          saves: 25,
          shares: 25,
          totalEngagement: 50,
        },
      ]);
      expect(
        (await topContent(organizationId, undefined, 1)).map(
          (row) => row.postId,
        ),
      ).toEqual([leader]);
    });

    it('ranks by MAX(views) with the same postId tie-break for the views metric', async () => {
      const viewsB = await seedPost('views-b');
      const viewsA = await seedPost('views-a');
      const viewsLeader = await seedPost('views-leader');
      await seedAnalytics([
        { date: MID_WINDOW, postId: viewsB, totalSaves: 999, totalViews: 40 },
        { date: MID_WINDOW, postId: viewsA, totalViews: 40 },
        { date: MID_WINDOW, postId: viewsLeader, totalViews: 70 },
      ]);

      expect(
        (
          await topContent(organizationId, undefined, 10, AnalyticsMetric.VIEWS)
        ).map(({ postId: id, views }) => ({ postId: id, views })),
      ).toEqual([
        { postId: viewsLeader, views: 70 },
        { postId: viewsA, views: 40 },
        { postId: viewsB, views: 40 },
      ]);
    });

    it('returns an empty list when the organization has no rows in the window', async () => {
      const outside = await seedPost('outside');
      await seedAnalytics([
        { date: day('2026-02-01'), postId: outside, totalLikes: 100 },
      ]);

      await expect(topContent(organizationId)).resolves.toEqual([]);
      await expect(topContent(otherOrganizationId)).resolves.toEqual([]);
    });

    it('reads defaulted metric columns (saves, comments, shares) as 0, never NULL', async () => {
      const likesOnly = await seedPost('likes-only');
      await seedAnalytics([
        { date: MID_WINDOW, postId: likesOnly, totalLikes: 12 },
      ]);

      const [row] = await topContent(organizationId);

      expect(row).toMatchObject({
        comments: 0,
        engagementRate: 0,
        likes: 12,
        postId: likesOnly,
        saves: 0,
        shares: 0,
        totalEngagement: 12,
        views: 0,
      });
      expect(Number.isNaN(row?.totalEngagement)).toBe(false);
    });
  },
);
