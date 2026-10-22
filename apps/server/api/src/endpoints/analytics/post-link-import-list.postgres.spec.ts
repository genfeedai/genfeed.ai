import { AnalyticsService } from '@api/endpoints/analytics/analytics.service';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import { AnalyticsMetric, CredentialPlatform } from '@genfeedai/contracts';
import { Prisma } from '@genfeedai/prisma';
import { ConfigService } from '@libs/config/config.service';
import { LoggerService } from '@libs/logger/logger.service';
import { Test } from '@nestjs/testing';
import { Client } from 'pg';

vi.unmock('@genfeedai/prisma');
const connectionString = process.env.POST_LINK_TEST_DATABASE_URL;
if (connectionString) {
  const url = new URL(connectionString);
  if (
    !['localhost', '127.0.0.1'].includes(url.hostname) ||
    url.pathname !== '/genfeed_7823_disposable'
  )
    throw new Error(
      'POST_LINK_TEST_DATABASE_URL must name the disposable local tracking database',
    );
}

describe.skipIf(!connectionString)(
  'imported analytics list on PostgreSQL',
  () => {
    const client = new Client({ connectionString });
    let service: AnalyticsService;
    beforeAll(async () => {
      await client.connect();
      await client.query(`
      CREATE TEMP TABLE brands (id text, "organizationId" text, "isDeleted" boolean DEFAULT false, label text);
      CREATE TEMP TABLE posts (
        id text, "organizationId" text, "brandId" text, "isDeleted" boolean DEFAULT false, platform text,
        "publishedAt" timestamp, "targetExecutionState" text DEFAULT 'PUBLISHED', "isAnalyticsEnabled" boolean,
        source text, label text, description text, visibility text, "entityIngredientId" text
      );
      CREATE TEMP TABLE ingredients (id text, "organizationId" text, "isDeleted" boolean, category text);
      CREATE TEMP TABLE post_analytics (
        id text, "postId" text, "organizationId" text, "brandId" text, platform text, date timestamp,
        "isDeleted" boolean DEFAULT false, "totalViews" integer, "totalLikes" integer,
        "totalComments" integer, "totalShares" integer, "totalSaves" integer, "engagementRate" double precision
      );
      INSERT INTO brands VALUES ('brand', 'org', false, 'My brand'), ('foreign-brand', 'foreign-org', false, 'Other brand');
      INSERT INTO posts (id, "organizationId", "brandId", platform, "publishedAt", "isAnalyticsEnabled", source, label) VALUES
        ('pending', 'org', 'brand', 'twitter', '2026-01-10', true, 'extension', 'Waiting X import'),
        ('link-only', 'org', 'brand', 'linkedin', '2026-01-10', false, 'extension', 'LinkedIn article'),
        ('collected', 'org', 'brand', 'youtube', '2026-01-10', true, 'extension', 'YouTube import'),
        ('foreign', 'foreign-org', 'foreign-brand', 'twitter', '2026-01-10', true, 'extension', 'Other tenant');
      INSERT INTO post_analytics VALUES ('metric', 'collected', 'org', 'brand', 'YOUTUBE', '2026-01-11', false, 100, 10, 2, 1, 0, 13);
    `);
      const module = await Test.createTestingModule({
        providers: [
          AnalyticsService,
          {
            provide: PrismaService,
            useValue: {
              $queryRaw: async (...args: Parameters<typeof Prisma.sql>) => {
                const query = Prisma.sql(...args);
                return (await client.query(query.text, query.values)).rows;
              },
            },
          },
          { provide: ConfigService, useValue: { get: vi.fn() } },
          {
            provide: LoggerService,
            useValue: {
              log: vi.fn(),
              error: vi.fn(),
              debug: vi.fn(),
              warn: vi.fn(),
            },
          },
        ],
      }).compile();
      service = module.get(AnalyticsService);
    });
    afterAll(async () => {
      await client.end();
    });
    it('lists pending and link-only imports alongside collected posts without duplicates or foreign records', async () => {
      const posts = await service.getTopContent(
        '2026-01-01',
        '2026-01-31',
        50,
        AnalyticsMetric.VIEWS,
        'brand',
        undefined,
        'org',
        'extension',
      );
      expect(posts).toHaveLength(3);
      expect(posts).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            postId: 'pending',
            source: 'extension',
            metricsStatus: 'pending',
          }),
          expect.objectContaining({
            postId: 'link-only',
            source: 'extension',
            metricsStatus: 'unavailable',
          }),
          expect.objectContaining({
            postId: 'collected',
            totalViews: 100,
            metricsStatus: 'collected',
          }),
        ]),
      );
    });
    it('applies the platform filter to both sides of the union', async () => {
      const posts = await service.getTopContent(
        '2026-01-01',
        '2026-01-31',
        50,
        AnalyticsMetric.VIEWS,
        'brand',
        CredentialPlatform.TWITTER,
        'org',
        'extension',
      );
      expect(posts).toEqual([expect.objectContaining({ postId: 'pending' })]);
    });
    it('excludes deleted imports and dates outside the selected period', async () => {
      await client.query('UPDATE posts SET "isDeleted" = true WHERE id = $1', [
        'pending',
      ]);
      const posts = await service.getTopContent(
        '2026-01-01',
        '2026-01-31',
        50,
        AnalyticsMetric.VIEWS,
        'brand',
        CredentialPlatform.TWITTER,
        'org',
      );
      expect(posts).toEqual([]);
      expect(
        await service.getTopContent(
          '2026-02-01',
          '2026-02-28',
          50,
          AnalyticsMetric.VIEWS,
          'brand',
          undefined,
          'org',
        ),
      ).toEqual([]);
    });
  },
);
