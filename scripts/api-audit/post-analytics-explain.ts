import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { config } from 'dotenv';

type QueryValue = Date | number | string | string[];

interface PgClient {
  connect(): Promise<void>;
  end(): Promise<void>;
  query<T = Record<string, unknown>>(
    sql: string,
    values?: unknown[],
  ): Promise<{ rows: T[] }>;
}

interface PgModule {
  Client: new (options: {
    connectionString: string;
    connectionTimeoutMillis: number;
    ssl?: { rejectUnauthorized: boolean };
  }) => PgClient;
}

export interface ExplainQuery {
  description: string;
  name: string;
  source: string;
  sql: string;
  values: QueryValue[];
  window: '30d' | '90d' | 'hierarchy';
}

export interface ExplainSummary {
  actualRows: number;
  bindSignature: string[];
  executionMs: number;
  indexesUsed: string[];
  name: string;
  nodeTypes: string[];
  planningMs: number;
  planRows: number;
  seqScanCount: number;
  source: string;
  stage: 'after-indexes' | 'before-indexes' | 'current';
  totalCost: number;
  window: ExplainQuery['window'];
}

interface ExplainRunResult {
  budgets: typeof QUERY_BUDGETS_MS;
  fixtureRows: number;
  generatedAt: string;
  queries: ExplainSummary[];
}

interface CliOptions {
  compareIndexes: boolean;
  databaseUrl?: string;
  env: string;
  fixtureRows: number;
  json: boolean;
}

type PlanNode = Record<string, unknown> & {
  Plans?: PlanNode[];
};

const DEFAULT_FIXTURE_ROWS = 75_000;
const QUERY_BUDGETS_MS = {
  dashboard30DayP95: 250,
  dashboard90DayP95: 750,
  hierarchyLookupP95: 50,
};

export function buildPostAnalyticsExplainQueries(): ExplainQuery[] {
  const start30 = new Date('2026-01-15T00:00:00.000Z');
  const end30 = new Date('2026-02-14T23:59:59.999Z');
  const start90 = new Date('2026-01-01T00:00:00.000Z');
  const end90 = new Date('2026-03-31T23:59:59.999Z');
  const orgIds = ['org-1', 'org-2', 'org-3'];

  return [
    {
      description: 'Time series by day/platform with organization scope.',
      name: 'analytics.timeSeries.org',
      source:
        'apps/server/api/src/endpoints/analytics/analytics.service.ts:getTimeSeriesData',
      sql: `
        SELECT
          TO_CHAR("date", 'YYYY-MM-DD') AS day,
          "platform"::text AS platform,
          SUM("totalComments") AS comments,
          AVG("engagementRate") AS engagement_rate,
          SUM("totalLikes") AS likes,
          SUM("totalSaves") AS saves,
          SUM("totalShares") AS shares,
          SUM("totalViews") AS views
        FROM "post_analytics"
        WHERE "date" >= $1
          AND "date" <= $2
          AND "organizationId" = $3
        GROUP BY TO_CHAR("date", 'YYYY-MM-DD'), "platform"
        ORDER BY day ASC
      `,
      values: [start30, end30, 'org-1'],
      window: '30d',
    },
    {
      description: 'Current overview totals with brand and organization scope.',
      name: 'analytics.overview.current',
      source:
        'apps/server/api/src/endpoints/analytics/analytics.service.ts:fetchOverviewCurrentMetrics',
      sql: `
        SELECT
          AVG("engagementRate") AS avg_engagement_rate,
          SUM("totalComments") AS total_comments,
          SUM("totalLikes") AS total_likes,
          COUNT(*) AS total_posts,
          SUM("totalSaves") AS total_saves,
          SUM("totalShares") AS total_shares,
          SUM("totalViews") AS total_views
        FROM "post_analytics"
        WHERE "date" >= $1 AND "date" <= $2
          AND "brandId" = $3
          AND "organizationId" = $4
      `,
      values: [start30, end30, 'brand-1', 'org-1'],
      window: '30d',
    },
    {
      description:
        'Previous overview totals with brand and organization scope.',
      name: 'analytics.overview.previous',
      source:
        'apps/server/api/src/endpoints/analytics/analytics.service.ts:fetchOverviewPreviousMetrics',
      sql: `
        SELECT
          SUM("totalLikes" + "totalComments" + "totalShares" + "totalSaves") AS total_engagement,
          COUNT(*) AS total_posts,
          SUM("totalViews") AS total_views
        FROM "post_analytics"
        WHERE "date" >= $1 AND "date" <= $2
          AND "brandId" = $3
          AND "organizationId" = $4
      `,
      values: [start90, end90, 'brand-1', 'org-1'],
      window: '90d',
    },
    {
      description:
        'Best posting hour per platform with brand and organization scope.',
      name: 'analytics.bestPostingTimes',
      source:
        'apps/server/api/src/endpoints/analytics/analytics.service.ts:getBestPostingTimes',
      sql: `
        WITH hour_stats AS (
          SELECT
            "platform"::text AS platform,
            EXTRACT(HOUR FROM "date") AS hour,
            AVG("engagementRate") AS avg_engagement_rate,
            COUNT(*) AS post_count
          FROM "post_analytics"
          WHERE "date" >= $1 AND "date" <= $2
            AND "brandId" = $3
            AND "organizationId" = $4
          GROUP BY "platform", EXTRACT(HOUR FROM "date")
        ),
        ranked AS (
          SELECT
            platform,
            hour,
            avg_engagement_rate,
            post_count,
            ROW_NUMBER() OVER (PARTITION BY platform ORDER BY avg_engagement_rate DESC, post_count DESC) AS rn
          FROM hour_stats
        )
        SELECT platform, hour, avg_engagement_rate, post_count
        FROM ranked
        WHERE rn = 1
        ORDER BY platform ASC
      `,
      values: [start90, end90, 'brand-1', 'org-1'],
      window: '90d',
    },
    {
      description:
        'Top content ordered by engagement with brand/platform/org scope.',
      name: 'analytics.topContent.engagement',
      source:
        'apps/server/api/src/endpoints/analytics/analytics.service.ts:fetchTopContent',
      sql: `
        SELECT
          pa.id,
          pa."postId" AS post_id,
          pa."platform"::text AS platform,
          pa."date",
          pa."totalViews" AS total_views,
          pa."totalLikes" AS total_likes,
          pa."totalComments" AS total_comments,
          pa."totalSaves" AS total_saves,
          pa."totalShares" AS total_shares,
          pa."engagementRate" AS engagement_rate,
          (pa."totalLikes" + pa."totalComments" + pa."totalShares" + pa."totalSaves") AS total_engagement,
          p.label AS label,
          p.description AS description,
          b.label AS brand_name,
          NULL AS brand_logo
        FROM "post_analytics" pa
        LEFT JOIN "posts" p ON p.id = pa."postId"
        LEFT JOIN "brands" b ON b.id = pa."brandId"
        WHERE pa."date" >= $1
          AND pa."date" <= $2
          AND pa."brandId" = $3
          AND pa."platform"::text = $4
          AND pa."organizationId" = $5
        ORDER BY (pa."totalLikes" + pa."totalComments" + pa."totalShares" + pa."totalSaves") DESC
        LIMIT $6
      `,
      values: [start30, end30, 'brand-1', 'YOUTUBE', 'org-1', 50],
      window: '30d',
    },
    {
      description: 'Platform comparison totals with brand scope.',
      name: 'analytics.platformComparison.brand',
      source:
        'apps/server/api/src/endpoints/analytics/analytics.service.ts:getPlatformComparison',
      sql: `
        SELECT
          "platform"::text AS platform,
          AVG("engagementRate") AS avg_engagement_rate,
          SUM("totalComments") AS total_comments,
          SUM("totalLikes") AS total_likes,
          COUNT(*) AS total_posts,
          SUM("totalSaves") AS total_saves,
          SUM("totalShares") AS total_shares,
          SUM("totalViews") AS total_views,
          SUM("totalLikes" + "totalComments" + "totalShares" + "totalSaves") AS total_engagement
        FROM "post_analytics"
        WHERE "date" >= $1 AND "date" <= $2
          AND "brandId" = $3
        GROUP BY "platform"
        ORDER BY SUM("totalViews") DESC
      `,
      values: [start90, end90, 'brand-1'],
      window: '90d',
    },
    {
      description: 'Growth trend current window with brand scope.',
      name: 'analytics.growth.current',
      source:
        'apps/server/api/src/endpoints/analytics/analytics.service.ts:fetchGrowthCurrent',
      sql: `
        SELECT
          TO_CHAR("date", 'YYYY-MM-DD') AS day,
          SUM("totalComments") AS comments,
          SUM("totalLikes") AS likes,
          COUNT(*) AS posts,
          SUM("totalSaves") AS saves,
          SUM("totalShares") AS shares,
          SUM("totalViews") AS views,
          SUM("totalLikes" + "totalComments" + "totalShares" + "totalSaves") AS engagement
        FROM "post_analytics"
        WHERE "date" >= $1 AND "date" <= $2
          AND "brandId" = $3
        GROUP BY TO_CHAR("date", 'YYYY-MM-DD')
        ORDER BY day ASC
      `,
      values: [start30, end30, 'brand-1'],
      window: '30d',
    },
    {
      description: 'Growth trend previous window with brand scope.',
      name: 'analytics.growth.previous',
      source:
        'apps/server/api/src/endpoints/analytics/analytics.service.ts:fetchGrowthPrevious',
      sql: `
        SELECT
          SUM("totalComments") AS total_comments,
          SUM("totalLikes") AS total_likes,
          COUNT(*) AS total_posts,
          SUM("totalSaves") AS total_saves,
          SUM("totalShares") AS total_shares,
          SUM("totalViews") AS total_views
        FROM "post_analytics"
        WHERE "date" >= $1 AND "date" <= $2
          AND "brandId" = $3
      `,
      values: [start90, end90, 'brand-1'],
      window: '90d',
    },
    {
      description: 'Engagement breakdown with brand and platform scope.',
      name: 'analytics.engagementBreakdown',
      source:
        'apps/server/api/src/endpoints/analytics/analytics.service.ts:getEngagementBreakdown',
      sql: `
        SELECT
          SUM("totalComments") AS total_comments,
          SUM("totalLikes") AS total_likes,
          SUM("totalSaves") AS total_saves,
          SUM("totalShares") AS total_shares
        FROM "post_analytics"
        WHERE "date" >= $1 AND "date" <= $2
          AND "brandId" = $3
          AND "platform"::text = $4
      `,
      values: [start30, end30, 'brand-1', 'YOUTUBE'],
      window: '30d',
    },
    {
      description:
        'Viral hook post projection with brand and organization scope.',
      name: 'analytics.viralHooks.videos',
      source:
        'apps/server/api/src/endpoints/analytics/analytics.service.ts:fetchViralHookVideos',
      sql: `
        SELECT
          pa."postId" AS id,
          ARRAY_AGG(DISTINCT pa."platform"::text) AS platforms,
          SUM(pa."totalLikes" + pa."totalComments" + pa."totalShares" + pa."totalSaves") AS total_engagement,
          SUM(pa."totalViews") AS total_views,
          p.description AS description,
          p.label AS title
        FROM "post_analytics" pa
        LEFT JOIN "posts" p ON p.id = pa."postId"
        WHERE pa."date" >= $1 AND pa."date" <= $2
          AND pa."brandId" = $3
          AND pa."organizationId" = $4
        GROUP BY pa."postId", p.description, p.label
        ORDER BY total_engagement DESC
        LIMIT 50
      `,
      values: [start90, end90, 'brand-1', 'org-1'],
      window: '90d',
    },
    {
      description:
        'Viral hook platform rollup with brand and organization scope.',
      name: 'analytics.viralHooks.platforms',
      source:
        'apps/server/api/src/endpoints/analytics/analytics.service.ts:fetchViralHookPlatforms',
      sql: `
        SELECT
          pa."platform"::text AS platform,
          COUNT(*) AS post_count,
          SUM(pa."totalLikes" + pa."totalComments" + pa."totalShares" + pa."totalSaves") AS total_engagement,
          SUM(pa."totalViews") AS total_views
        FROM "post_analytics" pa
        WHERE pa."date" >= $1 AND pa."date" <= $2
          AND pa."brandId" = $3
          AND pa."organizationId" = $4
        GROUP BY pa."platform"
        ORDER BY total_engagement DESC
        LIMIT 5
      `,
      values: [start90, end90, 'brand-1', 'org-1'],
      window: '90d',
    },
    {
      description:
        'Entity leaderboard current analytics grouped by organization ids.',
      name: 'entityLeaderboard.current.org',
      source:
        'apps/server/api/src/endpoints/analytics/entity-leaderboard.service.ts:getCurrentAnalytics',
      sql: `
        SELECT
          "organizationId" AS entity_id,
          AVG("engagementRate") AS avg_engagement_rate,
          SUM("totalViews") AS total_views,
          SUM("totalLikes") AS total_likes,
          SUM("totalComments") AS total_comments,
          SUM("totalShares") AS total_shares,
          SUM("totalSaves") AS total_saves,
          COUNT(DISTINCT "postId") AS unique_posts,
          ARRAY_AGG(DISTINCT "platform"::text) AS platforms
        FROM "post_analytics"
        WHERE "organizationId" = ANY($1::text[])
          AND "date" >= $2
          AND "date" <= $3
        GROUP BY "organizationId"
      `,
      values: [orgIds, start30, end30],
      window: '30d',
    },
    {
      description:
        'Entity leaderboard previous engagement grouped by brand ids.',
      name: 'entityLeaderboard.previous.brand',
      source:
        'apps/server/api/src/endpoints/analytics/entity-leaderboard.service.ts:getPreviousEngagement',
      sql: `
        SELECT
          "brandId" AS entity_id,
          SUM("totalLikes" + "totalComments" + "totalShares" + "totalSaves") AS total_engagement
        FROM "post_analytics"
        WHERE "brandId" = ANY($1::text[])
          AND "date" >= $2
          AND "date" <= $3
        GROUP BY "brandId"
      `,
      values: [['brand-1', 'brand-2', 'brand-3'], start90, end90],
      window: '90d',
    },
    {
      description: 'Recursive post ancestor lookup with bounded depth.',
      name: 'posts.findRootPost.ancestors',
      source:
        'apps/server/api/src/collections/posts/services/posts.service.ts:findRootPost',
      sql: `
        WITH RECURSIVE ancestors AS (
          SELECT id, "parentId", 1 AS depth
          FROM "posts"
          WHERE id = $1 AND "isDeleted" = false
          UNION ALL
          SELECT p.id, p."parentId", a.depth + 1
          FROM "posts" p
          INNER JOIN ancestors a ON p.id = a."parentId"
          WHERE p."isDeleted" = false AND a.depth <= $2
        )
        SELECT id, "parentId", depth FROM ancestors
        ORDER BY depth ASC
        LIMIT $3
      `,
      values: ['post-128', 100, 101],
      window: 'hierarchy',
    },
  ];
}

export function redactBindSignature(values: QueryValue[]): string[] {
  return values.map((value) => {
    if (value instanceof Date) {
      return 'date';
    }
    if (Array.isArray(value)) {
      return `array<string>[${value.length}]`;
    }
    return `${typeof value}(${String(value).length})`;
  });
}

export function summarizeExplainJson(
  query: ExplainQuery,
  stage: ExplainSummary['stage'],
  explainRows: Array<Record<string, unknown>>,
): ExplainSummary {
  const explain = explainRows[0]?.['QUERY PLAN'];
  if (!Array.isArray(explain) || explain.length === 0) {
    throw new Error(
      `EXPLAIN did not return FORMAT JSON rows for ${query.name}`,
    );
  }

  const document = explain[0] as Record<string, unknown>;
  const root = document.Plan as PlanNode | undefined;
  if (!root) {
    throw new Error(`EXPLAIN document missing root Plan for ${query.name}`);
  }

  const nodes = flattenPlan(root);
  const nodeTypes = uniqueSorted(
    nodes.map((node) => String(node['Node Type'] ?? 'unknown')),
  );
  const indexesUsed = uniqueSorted(
    nodes
      .map((node) => node['Index Name'])
      .filter(
        (indexName): indexName is string => typeof indexName === 'string',
      ),
  );

  return {
    actualRows: Number(root['Actual Rows'] ?? 0),
    bindSignature: redactBindSignature(query.values),
    executionMs: Number(document['Execution Time'] ?? 0),
    indexesUsed,
    name: query.name,
    nodeTypes,
    planningMs: Number(document['Planning Time'] ?? 0),
    planRows: Number(root['Plan Rows'] ?? 0),
    seqScanCount: nodes.filter((node) => node['Node Type'] === 'Seq Scan')
      .length,
    source: query.source,
    stage,
    totalCost: Number(root['Total Cost'] ?? 0),
    window: query.window,
  };
}

export async function runPostAnalyticsExplain(
  options: CliOptions,
): Promise<ExplainRunResult> {
  const pg = await loadPgModule();
  if (!pg) {
    throw new Error('pg module not found under node_modules/.bun');
  }

  const databaseUrl = options.databaseUrl ?? process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error(
      'DATABASE_URL is required. Pass --database-url=... or set it via .env.local.',
    );
  }

  const client = new pg.Client({
    connectionString: normalizeDatabaseUrl(databaseUrl),
    connectionTimeoutMillis: 10_000,
    ssl: shouldUseRelaxedSsl(databaseUrl)
      ? { rejectUnauthorized: false }
      : undefined,
  });

  await client.connect();
  try {
    const queries = buildPostAnalyticsExplainQueries();
    const summaries: ExplainSummary[] = [];

    if (options.fixtureRows > 0) {
      await createFixtureTables(client, options.fixtureRows);
      if (options.compareIndexes) {
        summaries.push(
          ...(await explainQueries(client, queries, 'before-indexes')),
        );
        await createFixtureIndexes(client);
      } else {
        await createFixtureIndexes(client);
      }
      await analyzeFixtureTables(client);
      summaries.push(
        ...(await explainQueries(client, queries, 'after-indexes')),
      );
    } else {
      summaries.push(...(await explainQueries(client, queries, 'current')));
    }

    return {
      budgets: QUERY_BUDGETS_MS,
      fixtureRows: options.fixtureRows,
      generatedAt: new Date().toISOString(),
      queries: summaries,
    };
  } finally {
    await client.end();
  }
}

export function formatExplainRun(result: ExplainRunResult): string {
  const lines = [
    '# Post Analytics EXPLAIN Smoke',
    '',
    `Generated: ${result.generatedAt}`,
    `Fixture rows: ${result.fixtureRows}`,
    '',
    'Target budgets:',
    `- dashboard 30-day p95: ${result.budgets.dashboard30DayP95}ms`,
    `- dashboard 90-day p95: ${result.budgets.dashboard90DayP95}ms`,
    `- hierarchy lookup p95: ${result.budgets.hierarchyLookupP95}ms`,
    '',
    '| Stage | Query | Window | Exec ms | Plan rows | Actual rows | Seq scans | Indexes used | Bind signature |',
    '| --- | --- | --- | ---: | ---: | ---: | ---: | --- | --- |',
  ];

  for (const summary of result.queries) {
    lines.push(
      [
        summary.stage,
        summary.name,
        summary.window,
        summary.executionMs.toFixed(3),
        String(summary.planRows),
        String(summary.actualRows),
        String(summary.seqScanCount),
        summary.indexesUsed.join(', ') || '-',
        summary.bindSignature.join(', '),
      ]
        .map(escapeMarkdownCell)
        .join(' | ')
        .replace(/^/, '| ')
        .replace(/$/, ' |'),
    );
  }

  lines.push('');
  return lines.join('\n');
}

function flattenPlan(node: PlanNode): PlanNode[] {
  return [node, ...(node.Plans ?? []).flatMap(flattenPlan)];
}

function uniqueSorted(values: string[]): string[] {
  return Array.from(new Set(values)).sort((left, right) =>
    left.localeCompare(right),
  );
}

async function explainQueries(
  client: PgClient,
  queries: ExplainQuery[],
  stage: ExplainSummary['stage'],
): Promise<ExplainSummary[]> {
  const summaries: ExplainSummary[] = [];
  for (const query of queries) {
    const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`;
    const result = await client.query(explainSql, query.values);
    summaries.push(summarizeExplainJson(query, stage, result.rows));
  }
  return summaries;
}

async function createFixtureTables(
  client: PgClient,
  rows: number,
): Promise<void> {
  await client.query('DROP TABLE IF EXISTS pg_temp."post_analytics"');
  await client.query('DROP TABLE IF EXISTS pg_temp."posts"');
  await client.query('DROP TABLE IF EXISTS pg_temp."brands"');

  await client.query(`
    CREATE TEMP TABLE "brands" (
      id text PRIMARY KEY,
      label text NOT NULL
    )
  `);

  await client.query(`
    CREATE TEMP TABLE "posts" (
      id text PRIMARY KEY,
      "parentId" text,
      "isDeleted" boolean NOT NULL DEFAULT false,
      label text,
      description text
    )
  `);

  await client.query(`
    CREATE TEMP TABLE "post_analytics" (
      id text NOT NULL,
      "postId" text NOT NULL,
      "organizationId" text NOT NULL,
      "brandId" text NOT NULL,
      "platform" text NOT NULL,
      "date" timestamp without time zone NOT NULL,
      "totalViews" integer NOT NULL,
      "totalLikes" integer NOT NULL,
      "totalComments" integer NOT NULL,
      "totalShares" integer NOT NULL,
      "totalSaves" integer NOT NULL,
      "engagementRate" double precision NOT NULL
    )
  `);

  await client.query(`
    INSERT INTO "brands" (id, label)
    SELECT 'brand-' || g::text, 'Brand ' || g::text
    FROM generate_series(1, 50) AS g
  `);

  await client.query(`
    INSERT INTO "posts" (id, "parentId", "isDeleted", label, description)
    SELECT
      'post-' || g::text,
      CASE WHEN g = 1 THEN NULL ELSE 'post-' || floor(g / 2)::integer::text END,
      false,
      'Post ' || g::text,
      'Hook ' || (g % 100)::text || '. Fixture description for analytics EXPLAIN.'
    FROM generate_series(1, 10000) AS g
  `);

  await client.query(
    `
    INSERT INTO "post_analytics" (
      id,
      "postId",
      "organizationId",
      "brandId",
      "platform",
      "date",
      "totalViews",
      "totalLikes",
      "totalComments",
      "totalShares",
      "totalSaves",
      "engagementRate"
    )
    SELECT
      'pa-' || g::text,
      'post-' || ((g % 10000) + 1)::text,
      'org-' || ((g % 20) + 1)::text,
      'brand-' || ((g % 50) + 1)::text,
      (ARRAY[
        'YOUTUBE',
        'TIKTOK',
        'INSTAGRAM',
        'LINKEDIN',
        'FACEBOOK',
        'TWITTER',
        'PINTEREST',
        'REDDIT',
        'MEDIUM'
      ])[(g % 9) + 1],
      TIMESTAMP '2026-01-01 00:00:00'
        + ((g % 120)::text || ' days')::interval
        + ((g % 24)::text || ' hours')::interval,
      (100 + (g % 10000))::integer,
      (g % 500)::integer,
      (g % 80)::integer,
      (g % 40)::integer,
      (g % 30)::integer,
      ((g % 1000)::double precision / 100.0)
    FROM generate_series(1, $1::integer) AS g
    `,
    [rows],
  );

  await client.query('ANALYZE "brands"');
  await client.query('ANALYZE "posts"');
  await client.query('ANALYZE "post_analytics"');
}

async function createFixtureIndexes(client: PgClient): Promise<void> {
  await client.query(
    'CREATE INDEX "post_analytics_date_idx" ON "post_analytics"("date" DESC)',
  );
  await client.query(
    'CREATE INDEX "post_analytics_organizationId_date_idx" ON "post_analytics"("organizationId", "date" DESC)',
  );
  await client.query(
    'CREATE INDEX "post_analytics_brandId_date_idx" ON "post_analytics"("brandId", "date" DESC)',
  );
  await client.query(
    'CREATE INDEX "post_analytics_platform_date_idx" ON "post_analytics"("platform", "date" DESC)',
  );
  await client.query(
    'CREATE INDEX "post_analytics_postId_date_idx" ON "post_analytics"("postId", "date" DESC)',
  );
  await client.query(
    'CREATE INDEX "posts_parentId_isDeleted_idx" ON "posts"("parentId", "isDeleted")',
  );
}

async function analyzeFixtureTables(client: PgClient): Promise<void> {
  await client.query('ANALYZE "posts"');
  await client.query('ANALYZE "post_analytics"');
}

async function loadPgModule(): Promise<PgModule | null> {
  try {
    const bunDir = path.join(process.cwd(), 'node_modules/.bun');
    const pgDir = readdirSync(bunDir).find((dir) => dir.startsWith('pg@'));
    if (!pgDir) {
      return null;
    }
    const moduleUrl = pathToFileURL(
      path.join(bunDir, pgDir, 'node_modules/pg/lib/index.js'),
    ).href;
    const mod = (await import(moduleUrl)) as { default?: PgModule } & PgModule;
    return mod.default ?? mod;
  } catch {
    return null;
  }
}

function normalizeDatabaseUrl(databaseUrl: string): string {
  const url = new URL(databaseUrl);
  if (
    !isLocalHost(url.hostname) &&
    url.searchParams.get('sslmode') !== 'disable'
  ) {
    url.searchParams.set('sslmode', 'no-verify');
  }
  return url.toString();
}

function shouldUseRelaxedSsl(databaseUrl: string): boolean {
  const url = new URL(databaseUrl);
  return (
    !isLocalHost(url.hostname) && url.searchParams.get('sslmode') !== 'disable'
  );
}

function isLocalHost(hostname: string): boolean {
  return (
    hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1'
  );
}

function parseCliOptions(argv: string[]): CliOptions {
  const args = new Set(argv);
  const value = (name: string): string | undefined => {
    const prefix = `${name}=`;
    return argv.find((arg) => arg.startsWith(prefix))?.slice(prefix.length);
  };

  return {
    compareIndexes: !args.has('--no-compare-indexes'),
    databaseUrl: value('--database-url'),
    env: value('--env') ?? 'local',
    fixtureRows: Number(value('--fixture-rows') ?? DEFAULT_FIXTURE_ROWS),
    json: args.has('--json'),
  };
}

function loadEnvFiles(env: string): void {
  for (const envPath of [
    path.resolve(process.cwd(), `.env.${env}`),
    path.resolve(process.cwd(), 'apps/server/api', `.env.${env}`),
  ]) {
    if (existsSync(envPath)) {
      config({ path: envPath, override: false, quiet: true });
    }
  }
}

function escapeMarkdownCell(value: string): string {
  return value.replaceAll('|', '\\|').replaceAll('\n', ' ');
}

async function main(): Promise<void> {
  const options = parseCliOptions(process.argv.slice(2));
  loadEnvFiles(options.env);
  const result = await runPostAnalyticsExplain(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(formatExplainRun(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(
      `[post-analytics-explain] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
