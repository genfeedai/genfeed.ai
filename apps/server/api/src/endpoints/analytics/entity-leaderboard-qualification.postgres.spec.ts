import {
  LeaderboardOrder,
  LeaderboardSort,
  OrganizationEmailClassFilter,
  OrganizationUsageFilter,
} from '@api/endpoints/analytics/dto/leaderboard-query.dto';
import { EntityLeaderboardService } from '@api/endpoints/analytics/entity-leaderboard.service';
import {
  OrganizationLifecycleStatus,
  OrganizationSourceFilter,
} from '@genfeedai/contracts';
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
 * The admin organizations list qualifies leads in raw SQL: the owner's email
 * domain, and generations and posts inside the date range. A mocked `$queryRaw` cannot prove
 * any of it, so this runs the real statements against a disposable local
 * PostgreSQL with throwaway temp tables.
 */
describe.skipIf(!connectionString)(
  'organization qualification filters on PostgreSQL',
  () => {
    const client = new Client({ connectionString });
    let service: EntityLeaderboardService;

    const list = async (
      filters: Parameters<
        EntityLeaderboardService['getOrganizationsWithStats']
      >[9],
      sort: LeaderboardSort = LeaderboardSort.GENERATIONS,
    ) => {
      const result = await service.getOrganizationsWithStats(
        '2026-10-20',
        '2026-10-26',
        1,
        10,
        sort,
        undefined,
        undefined,
        undefined,
        LeaderboardOrder.DESC,
        filters,
      );
      return {
        ids: result.data.map(({ id }) => id),
        total: result.pagination.total,
      };
    };

    const listRows = async (
      filters: Parameters<
        EntityLeaderboardService['getOrganizationsWithStats']
      >[9] = {},
    ) =>
      (
        await service.getOrganizationsWithStats(
          '2026-10-20',
          '2026-10-26',
          1,
          10,
          LeaderboardSort.GENERATIONS,
          undefined,
          undefined,
          undefined,
          LeaderboardOrder.DESC,
          filters,
        )
      ).data;

    beforeAll(async () => {
      await client.connect();
      await client.query(`
        CREATE TYPE pg_temp."IngredientOrigin" AS ENUM ('UPLOADED', 'GENERATED', 'IMPORTED', 'UNKNOWN');
        CREATE TYPE pg_temp."OrganizationCategory" AS ENUM ('CREATOR', 'BUSINESS', 'AGENCY', 'EXPERT');
        CREATE TEMP TABLE users (id text, email text);
        CREATE TYPE pg_temp."SubscriptionStatus" AS ENUM ('ACTIVE', 'CANCELLED', 'PAST_DUE', 'TRIALING', 'INCOMPLETE');
        CREATE TEMP TABLE organizations (
          id text, label text, "userId" text, "accountType" "OrganizationCategory",
          "isDeleted" boolean DEFAULT false, "createdAt" timestamp DEFAULT now(),
          "onboardingCompleted" boolean DEFAULT true
        );
        CREATE TEMP TABLE subscriptions (
          id text, "organizationId" text, status "SubscriptionStatus", plan text,
          "isDeleted" boolean DEFAULT false, "createdAt" timestamp DEFAULT now()
        );
        CREATE TEMP TABLE warmup_accounts (
          id text, "organizationId" text, status text,
          "isDeleted" boolean DEFAULT false, "createdAt" timestamp DEFAULT now()
        );
        CREATE TEMP TABLE ingredients (
          id text, "organizationId" text, "isDeleted" boolean DEFAULT false, origin "IngredientOrigin",
          "createdAt" timestamp
        );
        CREATE TEMP TABLE posts (
          id text, "organizationId" text, "brandId" text, "isDeleted" boolean DEFAULT false, "publishedAt" timestamp
        );
        CREATE TEMP TABLE post_analytics (
          id text, "organizationId" text, "brandId" text, date timestamp,
          "totalViews" integer, "totalLikes" integer, "totalComments" integer,
          "totalShares" integer, "totalSaves" integer, "engagementRate" double precision
        );
        INSERT INTO users (id, email) VALUES
          ('u-work', 'founder@Acme.io'),
          ('u-gmail', 'someone@gmail.com'),
          ('u-proton', 'someone@proton.me'),
          ('u-work2', 'ceo@vitae.ai'),
          ('u-none', NULL);
        INSERT INTO organizations (id, label, "userId", "accountType", "createdAt") VALUES
          ('acme', 'Acme', 'u-work', 'AGENCY', '2026-01-01'),
          ('personal-gmail', 'Personal', 'u-gmail', NULL, '2026-01-02'),
          ('personal-proton', 'Personal', 'u-proton', NULL, '2026-01-03'),
          ('vitae', 'Vitae', 'u-work2', 'BUSINESS', '2026-01-04'),
          ('no-email', 'No email', 'u-none', NULL, '2026-01-05');
        INSERT INTO organizations (id, label, "userId", "isDeleted", "createdAt")
          VALUES ('gone', 'Gone', 'u-work', true, '2026-01-06');
        -- Lifecycle: acme pays, vitae is still onboarding and was prepared by an operator,
        -- personal-gmail cancelled, personal-proton is in trial but never finished onboarding
        -- (paying wins over onboarding), no-email is free.
        UPDATE organizations SET "onboardingCompleted" = false WHERE id IN ('vitae', 'personal-proton');
        INSERT INTO subscriptions (id, "organizationId", status, plan, "createdAt") VALUES
          ('s1', 'acme', 'ACTIVE', 'SCALE', '2026-02-01'),
          ('s2', 'acme', 'CANCELLED', 'OLD', '2026-01-01'),
          ('s3', 'personal-gmail', 'CANCELLED', 'SCALE', '2026-02-01'),
          ('s4', 'personal-proton', 'TRIALING', 'SCALE', '2026-02-01');
        INSERT INTO subscriptions (id, "organizationId", status, plan, "isDeleted") VALUES
          ('s5', 'no-email', 'ACTIVE', 'GHOST', true);
        INSERT INTO warmup_accounts (id, "organizationId", status, "createdAt") VALUES
          ('w1', 'vitae', 'DRAFT', '2026-03-01'),
          ('w2', 'vitae', 'INVITED', '2026-04-01');
        INSERT INTO warmup_accounts (id, "organizationId", status, "isDeleted") VALUES
          ('w3', 'no-email', 'INVITED', true);
        -- Only live GENERATED assets inside the window (2026-10-20 to 2026-10-26) count:
        -- acme has two; the deleted, the uploaded and proton's older one do not.
        INSERT INTO ingredients (id, "organizationId", "isDeleted", origin, "createdAt") VALUES
          ('i1', 'acme', false, 'GENERATED', '2026-10-21'),
          ('i2', 'acme', false, 'GENERATED', '2026-10-22'),
          ('i3', 'acme', true, 'GENERATED', '2026-10-21'),
          ('i4', 'acme', false, 'UPLOADED', '2026-10-21'),
          ('i5', 'personal-gmail', false, 'GENERATED', '2026-10-25'),
          ('i6', 'personal-proton', false, 'GENERATED', '2025-03-01');
        -- vitae published one post long before the date window.
        INSERT INTO posts (id, "organizationId", "brandId", "isDeleted", "publishedAt") VALUES
          ('p1', 'vitae', 'b', false, '2025-01-01'),
          ('p2', 'no-email', 'b', true, '2026-10-21'),
          ('p3', 'no-email', 'b', false, NULL);
      `);

      const prisma = {
        $queryRaw: async (...args: Parameters<typeof Prisma.sql>) => {
          const query = Prisma.sql(...args);
          return (await client.query(query.text, query.values)).rows;
        },
        brand: { findMany: async () => [], groupBy: async () => [] },
        member: { groupBy: async () => [] },
        organization: {
          count: async () =>
            Number(
              (
                await client.query(
                  'SELECT COUNT(*) AS total FROM organizations WHERE "isDeleted" = false',
                )
              ).rows[0].total,
            ),
        },
        warmupAccount: {
          findMany: async (args: {
            where: { organizationId: { in: string[] } };
          }) =>
            (
              await client.query(
                'SELECT id, "organizationId", status FROM warmup_accounts WHERE "isDeleted" = false AND "organizationId" = ANY($1) ORDER BY "createdAt" DESC',
                [args.where.organizationId.in],
              )
            ).rows,
        },
        user: {
          findMany: async () =>
            (await client.query('SELECT id, email FROM users')).rows.map(
              (row: { id: string; email: string | null }) => ({
                avatar: null,
                email: row.email,
                firstName: null,
                handle: row.id,
                id: row.id,
                lastActiveAt: null,
                lastName: null,
                name: null,
              }),
            ),
        },
      };
      const organizationsService = {
        findAll: async (query: { where: { id: { in: string[] } } }) => ({
          docs: (
            await client.query(
              'SELECT id, label, "userId", "accountType" FROM organizations WHERE id = ANY($1)',
              [query.where.id.in],
            )
          ).rows,
        }),
      };

      service = new EntityLeaderboardService(
        prisma as never,
        organizationsService as never,
        { resolveBrandLogoUrls: async () => new Map() } as never,
        { resolveLogoUrls: async () => new Map() } as never,
        {} as never,
      );
    });

    afterAll(async () => {
      await client.end();
    });

    it('ranks by generations created in the range, counting only live generated assets', async () => {
      const { ids } = await list({});
      expect(ids.slice(0, 2)).toEqual(['acme', 'personal-gmail']);
    });

    it('keeps work-email owners and drops every free provider, however it is cased', async () => {
      expect(
        await list({ emailClass: OrganizationEmailClassFilter.COMPANY }),
      ).toEqual({ ids: ['acme', 'vitae'], total: 2 });
    });

    it('keeps free-provider owners, including the ones that are not gmail', async () => {
      const personal = await list({
        emailClass: OrganizationEmailClassFilter.PERSONAL,
      });
      expect([...personal.ids].sort()).toEqual([
        'personal-gmail',
        'personal-proton',
      ]);
      expect(personal.total).toBe(2);
    });

    it('treats an organization that generated or published in the range as active', async () => {
      const active = await list({ usage: OrganizationUsageFilter.ACTIVE });
      expect([...active.ids].sort()).toEqual(['acme', 'personal-gmail']);
      expect(active.total).toBe(2);
    });

    it('treats an organization with nothing in the range as inactive, even if it was active before', async () => {
      const inactive = await list({ usage: OrganizationUsageFilter.INACTIVE });
      expect([...inactive.ids].sort()).toEqual([
        'no-email',
        'personal-proton',
        'vitae',
      ]);
      expect(inactive.total).toBe(3);
    });

    it('combines the filters: work-email owners with nothing in the range', async () => {
      expect(
        await list({
          emailClass: OrganizationEmailClassFilter.COMPANY,
          usage: OrganizationUsageFilter.INACTIVE,
        }),
      ).toEqual({ ids: ['vitae'], total: 1 });
    });
    it('derives each lifecycle status at read time, with paying winning over onboarding', async () => {
      const rows = await listRows();
      expect(
        Object.fromEntries(rows.map(({ id, status }) => [id, status])),
      ).toEqual({
        acme: OrganizationLifecycleStatus.SUBSCRIBED,
        'no-email': OrganizationLifecycleStatus.FREE,
        'personal-gmail': OrganizationLifecycleStatus.CANCELLED,
        'personal-proton': OrganizationLifecycleStatus.TRIAL,
        vitae: OrganizationLifecycleStatus.ONBOARDING,
      });
    });

    it('names the plan behind a paid status and ignores deleted subscriptions', async () => {
      const rows = await listRows();
      expect(
        Object.fromEntries(rows.map(({ id, plan }) => [id, plan])),
      ).toEqual({
        acme: 'SCALE',
        'no-email': undefined,
        'personal-gmail': 'SCALE',
        'personal-proton': 'SCALE',
        vitae: undefined,
      });
    });

    it('attaches the newest live concierge account and none for a deleted one', async () => {
      const rows = await listRows();
      expect(
        Object.fromEntries(rows.map(({ id, concierge }) => [id, concierge])),
      ).toEqual({
        acme: undefined,
        'no-email': undefined,
        'personal-gmail': undefined,
        'personal-proton': undefined,
        vitae: { id: 'w2', status: 'INVITED' },
      });
    });

    it.each([
      [OrganizationLifecycleStatus.SUBSCRIBED, ['acme']],
      [OrganizationLifecycleStatus.ONBOARDING, ['vitae']],
      [OrganizationLifecycleStatus.TRIAL, ['personal-proton']],
      [OrganizationLifecycleStatus.CANCELLED, ['personal-gmail']],
      [OrganizationLifecycleStatus.FREE, ['no-email']],
      [OrganizationLifecycleStatus.PAST_DUE, []],
    ])(
      'filters by status %s and counts the same set',
      async (status, expected) => {
        const result = await list({ status });
        expect(result).toEqual({ ids: expected, total: expected.length });
      },
    );

    it('filters concierge and self-serve organizations', async () => {
      expect(
        await list({ source: OrganizationSourceFilter.CONCIERGE }),
      ).toEqual({ ids: ['vitae'], total: 1 });
      const selfServe = await list({
        source: OrganizationSourceFilter.SELF_SERVE,
      });
      expect([...selfServe.ids].sort()).toEqual([
        'acme',
        'no-email',
        'personal-gmail',
        'personal-proton',
      ]);
      expect(selfServe.total).toBe(4);
    });

    it('combines status with source and the email class', async () => {
      expect(
        await list({
          emailClass: OrganizationEmailClassFilter.COMPANY,
          source: OrganizationSourceFilter.CONCIERGE,
          status: OrganizationLifecycleStatus.ONBOARDING,
        }),
      ).toEqual({ ids: ['vitae'], total: 1 });
      expect(
        await list({
          source: OrganizationSourceFilter.CONCIERGE,
          status: OrganizationLifecycleStatus.SUBSCRIBED,
        }),
      ).toEqual({ ids: [], total: 0 });
    });
  },
);
