import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { pathToFileURL } from 'node:url';
import { config } from 'dotenv';
import {
  type ExplainQuery,
  type ExplainSummary,
  summarizeExplainJson,
} from './post-analytics-explain';

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

interface CliOptions {
  compareIndexes: boolean;
  databaseUrl?: string;
  env: string;
  fixtureRows: number;
  json: boolean;
}

export interface TrendReferenceCorpusExplainQuery extends ExplainQuery {
  expectedIndexes: string[];
}

export interface TrendReferenceCorpusExplainSummary extends ExplainSummary {
  expectedIndexMatched: boolean;
  expectedIndexes: string[];
}

interface TrendReferenceCorpusExplainRunResult {
  fixtureRows: number;
  generatedAt: string;
  queries: TrendReferenceCorpusExplainSummary[];
}

const DEFAULT_FIXTURE_ROWS = 50_000;
const TREND_REFERENCE_CORPUS_SOURCE =
  'apps/server/api/src/collections/trends/services/trend-reference-corpus.service.ts';

export function buildTrendReferenceCorpusExplainQueries(): TrendReferenceCorpusExplainQuery[] {
  const sourceReferenceIds = ['ref_00000001', 'ref_00000002', 'ref_00000003'];
  const sourceUrls = [
    'https://www.tiktok.com/@creator/video/1001',
    'https://www.linkedin.com/posts/openai_1002',
    'https://www.youtube.com/watch?v=1003',
  ];

  return [
    {
      description:
        'Resolve metadata/source preview URLs through normalized canonical URL lookup.',
      expectedIndexes: ['trend_source_refs_url_platform_deleted_idx'],
      name: 'trendReferenceCorpus.sourceUrlResolution',
      source: `${TREND_REFERENCE_CORPUS_SOURCE}:resolveSourceReferenceIds`,
      sql: `
        SELECT "id"
        FROM "trend_source_references"
        WHERE "canonicalUrl" = ANY($1::text[])
          AND "isDeleted" = false
        LIMIT $2
      `,
      values: [sourceUrls, sourceUrls.length],
      window: 'hierarchy',
    },
    {
      description: 'Fetch source reference ids linked to one visible trend.',
      expectedIndexes: ['trend_source_reference_links_trend_deleted_idx'],
      name: 'trendReferenceCorpus.trendLinks',
      source: `${TREND_REFERENCE_CORPUS_SOURCE}:getReferenceCorpus`,
      sql: `
        SELECT "sourceReferenceId"
        FROM "trend_source_reference_links"
        WHERE "trendId" = $1
          AND "isDeleted" = false
        LIMIT $2
      `,
      values: ['trend_0001', 100],
      window: 'hierarchy',
    },
    {
      description:
        'Rank global corpus references by engagement, virality, and freshness.',
      expectedIndexes: ['trend_source_refs_rank_idx'],
      name: 'trendReferenceCorpus.globalRank',
      source: `${TREND_REFERENCE_CORPUS_SOURCE}:getReferenceCorpus`,
      sql: `
        SELECT "id", "data"
        FROM "trend_source_references"
        WHERE "isDeleted" = false
        ORDER BY
          "currentEngagementTotal" DESC,
          "latestTrendViralityScore" DESC,
          "lastSeenAt" DESC
        LIMIT $1
      `,
      values: [30],
      window: 'hierarchy',
    },
    {
      description: 'Rank one platform corpus without JSON-field sorting.',
      expectedIndexes: ['trend_source_refs_platform_rank_idx'],
      name: 'trendReferenceCorpus.platformRank',
      source: `${TREND_REFERENCE_CORPUS_SOURCE}:getReferenceCorpus`,
      sql: `
        SELECT "id", "data"
        FROM "trend_source_references"
        WHERE "isDeleted" = false
          AND "platform" = $1
        ORDER BY
          "currentEngagementTotal" DESC,
          "latestTrendViralityScore" DESC,
          "lastSeenAt" DESC
        LIMIT $2
      `,
      values: ['tiktok', 30],
      window: 'hierarchy',
    },
    {
      description:
        'Rank one creator account on one platform without JSON-field sorting.',
      expectedIndexes: ['trend_source_refs_account_rank_idx'],
      name: 'trendReferenceCorpus.accountRank',
      source: `${TREND_REFERENCE_CORPUS_SOURCE}:getReferenceCorpus`,
      sql: `
        SELECT "id", "data"
        FROM "trend_source_references"
        WHERE "isDeleted" = false
          AND "platform" = $1
          AND "authorHandle" = $2
        ORDER BY
          "currentEngagementTotal" DESC,
          "latestTrendViralityScore" DESC,
          "lastSeenAt" DESC
        LIMIT $3
      `,
      values: ['tiktok', 'creator', 30],
      window: 'hierarchy',
    },
    {
      description:
        'Aggregate top reference accounts from scalar platform and author columns.',
      expectedIndexes: [
        'trend_source_refs_account_lookup_idx',
        'trend_source_refs_account_rank_idx',
      ],
      name: 'trendReferenceCorpus.topAccounts',
      source: `${TREND_REFERENCE_CORPUS_SOURCE}:getTopReferenceAccounts`,
      sql: `
        SELECT
          "platform",
          "authorHandle",
          AVG("latestTrendViralityScore") AS avg_trend_virality_score,
          COUNT(*) AS reference_count,
          MAX("lastSeenAt") AS last_seen_at,
          SUM("currentEngagementTotal") AS total_engagement
        FROM "trend_source_references"
        WHERE "authorHandle" IS NOT NULL
          AND "isDeleted" = false
          AND "platform" = $1
        GROUP BY "platform", "authorHandle"
        ORDER BY
          AVG("latestTrendViralityScore") DESC,
          COUNT("authorHandle") DESC,
          SUM("currentEngagementTotal") DESC
        LIMIT $2
      `,
      values: ['tiktok', 20],
      window: 'hierarchy',
    },
    {
      description:
        'Count brand remixes for the current page of source reference ids.',
      expectedIndexes: [
        '_remix_lineage_source_refs_B_index',
        'trend_remix_lineages_org_brand_deleted_idx',
      ],
      name: 'trendReferenceCorpus.remixCountsForPage',
      source: `${TREND_REFERENCE_CORPUS_SOURCE}:getRemixCounts`,
      sql: `
        SELECT
          refs."B" AS source_reference_id,
          COUNT(*) AS remix_count
        FROM "_remix_lineage_source_refs" refs
        INNER JOIN "trend_remix_lineages" lineage ON lineage."id" = refs."A"
        WHERE refs."B" = ANY($1::text[])
          AND lineage."organizationId" = $2
          AND lineage."brandId" = $3
          AND lineage."isDeleted" = false
        GROUP BY refs."B"
      `,
      values: [sourceReferenceIds, 'org_0001', 'brand_0001'],
      window: 'hierarchy',
    },
    {
      description:
        'Count brand remixes by source account without hydrating remix relations.',
      expectedIndexes: [
        '_remix_lineage_source_refs_AB_pkey',
        'trend_remix_lineages_org_brand_deleted_idx',
        'trend_source_refs_account_lookup_idx',
      ],
      name: 'trendReferenceCorpus.brandRemixCountsByAccount',
      source: `${TREND_REFERENCE_CORPUS_SOURCE}:getBrandRemixCountsByAccount`,
      sql: `
        SELECT
          source_ref."platform" AS platform,
          source_ref."authorHandle" AS author_handle,
          COUNT(*) AS remix_count
        FROM "_remix_lineage_source_refs" refs
        INNER JOIN "trend_remix_lineages" lineage ON lineage."id" = refs."A"
        INNER JOIN "trend_source_references" source_ref ON source_ref."id" = refs."B"
        WHERE lineage."organizationId" = $1
          AND lineage."brandId" = $2
          AND lineage."isDeleted" = false
          AND source_ref."isDeleted" = false
          AND source_ref."platform" IS NOT NULL
          AND source_ref."authorHandle" IS NOT NULL
          AND source_ref."platform" = $3
        GROUP BY source_ref."platform", source_ref."authorHandle"
      `,
      values: ['org_0001', 'brand_0001', 'tiktok'],
      window: 'hierarchy',
    },
  ];
}

export function summarizeTrendReferenceCorpusExplainJson(
  query: TrendReferenceCorpusExplainQuery,
  stage: ExplainSummary['stage'],
  explainRows: Array<Record<string, unknown>>,
): TrendReferenceCorpusExplainSummary {
  const summary = summarizeExplainJson(query, stage, explainRows);
  const expectedIndexMatched = query.expectedIndexes.some((indexName) =>
    summary.indexesUsed.includes(indexName),
  );

  return {
    ...summary,
    expectedIndexMatched,
    expectedIndexes: query.expectedIndexes,
  };
}

export async function runTrendReferenceCorpusExplain(
  options: CliOptions,
): Promise<TrendReferenceCorpusExplainRunResult> {
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
    const queries = buildTrendReferenceCorpusExplainQueries();
    const summaries: TrendReferenceCorpusExplainSummary[] = [];

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
      fixtureRows: options.fixtureRows,
      generatedAt: new Date().toISOString(),
      queries: summaries,
    };
  } finally {
    await client.end();
  }
}

export function formatTrendReferenceCorpusExplainRun(
  result: TrendReferenceCorpusExplainRunResult,
): string {
  const lines = [
    '# Trend Reference Corpus EXPLAIN Smoke',
    '',
    `Generated: ${result.generatedAt}`,
    `Fixture rows: ${result.fixtureRows}`,
    '',
    'Run against a fixture database with production-shaped cardinality unless fixture rows are 0.',
    '',
    '| Stage | Query | Exec ms | Plan rows | Actual rows | Seq scans | Expected index matched | Indexes used | Expected indexes | Bind signature |',
    '| --- | --- | ---: | ---: | ---: | ---: | --- | --- | --- | --- |',
  ];

  for (const summary of result.queries) {
    lines.push(
      [
        summary.stage,
        summary.name,
        summary.executionMs.toFixed(3),
        String(summary.planRows),
        String(summary.actualRows),
        String(summary.seqScanCount),
        summary.expectedIndexMatched ? 'yes' : 'no',
        summary.indexesUsed.join(', ') || '-',
        summary.expectedIndexes.join(', '),
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

async function explainQueries(
  client: PgClient,
  queries: TrendReferenceCorpusExplainQuery[],
  stage: ExplainSummary['stage'],
): Promise<TrendReferenceCorpusExplainSummary[]> {
  const summaries: TrendReferenceCorpusExplainSummary[] = [];
  for (const query of queries) {
    const explainSql = `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${query.sql}`;
    const result = await client.query(explainSql, query.values);
    summaries.push(
      summarizeTrendReferenceCorpusExplainJson(query, stage, result.rows),
    );
  }
  return summaries;
}

async function createFixtureTables(
  client: PgClient,
  rows: number,
): Promise<void> {
  await client.query(
    'DROP TABLE IF EXISTS pg_temp."_remix_lineage_source_refs"',
  );
  await client.query('DROP TABLE IF EXISTS pg_temp."trend_remix_lineages"');
  await client.query(
    'DROP TABLE IF EXISTS pg_temp."trend_source_reference_links"',
  );
  await client.query('DROP TABLE IF EXISTS pg_temp."trend_source_references"');

  await client.query(`
    CREATE TEMP TABLE "trend_source_references" (
      "id" text PRIMARY KEY,
      "canonicalUrl" text,
      "platform" text,
      "authorHandle" text,
      "currentEngagementTotal" integer NOT NULL DEFAULT 0,
      "latestTrendViralityScore" double precision NOT NULL DEFAULT 0,
      "lastSeenAt" timestamp without time zone,
      "data" jsonb NOT NULL DEFAULT '{}',
      "isDeleted" boolean NOT NULL DEFAULT false
    )
  `);

  await client.query(`
    CREATE TEMP TABLE "trend_source_reference_links" (
      "id" text PRIMARY KEY,
      "trendId" text,
      "sourceReferenceId" text,
      "isDeleted" boolean NOT NULL DEFAULT false
    )
  `);

  await client.query(`
    CREATE TEMP TABLE "trend_remix_lineages" (
      "id" text PRIMARY KEY,
      "organizationId" text NOT NULL,
      "brandId" text,
      "isDeleted" boolean NOT NULL DEFAULT false
    )
  `);

  await client.query(`
    CREATE TEMP TABLE "_remix_lineage_source_refs" (
      "A" text NOT NULL,
      "B" text NOT NULL,
      CONSTRAINT "_remix_lineage_source_refs_AB_pkey" PRIMARY KEY ("A", "B")
    )
  `);

  await client.query(
    `
    INSERT INTO "trend_source_references" (
      "id",
      "canonicalUrl",
      "platform",
      "authorHandle",
      "currentEngagementTotal",
      "latestTrendViralityScore",
      "lastSeenAt",
      "data",
      "isDeleted"
    )
    SELECT
      'ref_' || lpad(g::text, 8, '0'),
      CASE
        WHEN g % 3 = 0 THEN 'https://www.youtube.com/watch?v=' || g::text
        WHEN g % 3 = 1 THEN 'https://www.tiktok.com/@creator/video/' || g::text
        ELSE 'https://www.linkedin.com/posts/openai_' || g::text
      END,
      (ARRAY['tiktok', 'linkedin', 'youtube', 'instagram', 'x'])[(g % 5) + 1],
      'creator_' || (g % 500)::text,
      (100 + (g % 100000))::integer,
      ((g % 1000)::double precision / 10.0),
      TIMESTAMP '2026-01-01 00:00:00' + ((g % 120)::text || ' days')::interval,
      jsonb_build_object(
        'canonicalUrl',
        CASE
          WHEN g % 3 = 0 THEN 'https://www.youtube.com/watch?v=' || g::text
          WHEN g % 3 = 1 THEN 'https://www.tiktok.com/@creator/video/' || g::text
          ELSE 'https://www.linkedin.com/posts/openai_' || g::text
        END,
        'platform',
        (ARRAY['tiktok', 'linkedin', 'youtube', 'instagram', 'x'])[(g % 5) + 1],
        'authorHandle',
        'creator_' || (g % 500)::text
      ),
      false
    FROM generate_series(1, $1::integer) AS g
    `,
    [rows],
  );

  await client.query(
    `
    INSERT INTO "trend_source_reference_links" (
      "id",
      "trendId",
      "sourceReferenceId",
      "isDeleted"
    )
    SELECT
      'link_' || g::text,
      'trend_' || lpad(((g % 1000) + 1)::text, 4, '0'),
      'ref_' || lpad(((g % $1::integer) + 1)::text, 8, '0'),
      false
    FROM generate_series(1, LEAST($1::integer * 2, 100000)) AS g
    `,
    [rows],
  );

  await client.query(`
    INSERT INTO "trend_remix_lineages" (
      "id",
      "organizationId",
      "brandId",
      "isDeleted"
    )
    SELECT
      'lineage_' || lpad(g::text, 5, '0'),
      'org_' || lpad(((g % 20) + 1)::text, 4, '0'),
      'brand_' || lpad(((g % 100) + 1)::text, 4, '0'),
      false
    FROM generate_series(1, 20000) AS g
  `);

  await client.query(
    `
    INSERT INTO "_remix_lineage_source_refs" ("A", "B")
    SELECT
      'lineage_' || lpad(((g % 20000) + 1)::text, 5, '0'),
      'ref_' || lpad(((g % $1::integer) + 1)::text, 8, '0')
    FROM generate_series(1, 60000) AS g
    ON CONFLICT DO NOTHING
    `,
    [rows],
  );
}

async function createFixtureIndexes(client: PgClient): Promise<void> {
  await client.query(
    'CREATE INDEX "trend_source_refs_url_platform_deleted_idx" ON "trend_source_references"("canonicalUrl", "platform", "isDeleted")',
  );
  await client.query(
    'CREATE INDEX "trend_source_refs_account_lookup_idx" ON "trend_source_references"("isDeleted", "platform", "authorHandle", "lastSeenAt" DESC)',
  );
  await client.query(
    'CREATE INDEX "trend_source_refs_rank_idx" ON "trend_source_references"("isDeleted", "currentEngagementTotal" DESC, "latestTrendViralityScore" DESC)',
  );
  await client.query(
    'CREATE INDEX "trend_source_refs_platform_rank_idx" ON "trend_source_references"("isDeleted", "platform", "currentEngagementTotal" DESC, "latestTrendViralityScore" DESC, "lastSeenAt" DESC)',
  );
  await client.query(
    'CREATE INDEX "trend_source_refs_account_rank_idx" ON "trend_source_references"("isDeleted", "platform", "authorHandle", "currentEngagementTotal" DESC, "latestTrendViralityScore" DESC, "lastSeenAt" DESC)',
  );
  await client.query(
    'CREATE INDEX "trend_source_reference_links_trend_deleted_idx" ON "trend_source_reference_links"("trendId", "isDeleted")',
  );
  await client.query(
    'CREATE INDEX "trend_source_reference_links_ref_deleted_idx" ON "trend_source_reference_links"("sourceReferenceId", "isDeleted")',
  );
  await client.query(
    'CREATE INDEX "_remix_lineage_source_refs_B_index" ON "_remix_lineage_source_refs"("B")',
  );
  await client.query(
    'CREATE INDEX "trend_remix_lineages_org_brand_deleted_idx" ON "trend_remix_lineages"("organizationId", "brandId", "isDeleted")',
  );
}

async function analyzeFixtureTables(client: PgClient): Promise<void> {
  await client.query('ANALYZE "trend_source_references"');
  await client.query('ANALYZE "trend_source_reference_links"');
  await client.query('ANALYZE "trend_remix_lineages"');
  await client.query('ANALYZE "_remix_lineage_source_refs"');
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
  const result = await runTrendReferenceCorpusExplain(options);

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  process.stdout.write(formatTrendReferenceCorpusExplainRun(result));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  main().catch((error) => {
    process.stderr.write(
      `[trend-reference-corpus-explain] ${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  });
}
