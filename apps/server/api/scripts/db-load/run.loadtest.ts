/**
 * Profiles every catalog query against one scaled database and writes a JSON
 * result file. Driven by `run.mjs` (env: LOADTEST_*); not a unit test.
 *
 * Method, per (query, tenant kind):
 *   - R rounds, each in a freshly shuffled order, each with a fresh warmup, so
 *     drift and cache-order effects are spread over the samples instead of
 *     landing on one query.
 *   - typical tenants are drawn at random per sample (no single hot tenant);
 *     the whale is the one tenant whose fan-out grew with the scale.
 *   - one call at a time on a production-sized pool, wall clock measured
 *     around the real service call (so it includes Prisma + serialisation).
 *   - a per-statement timeout; a timeout is recorded as a failure, not dropped.
 *   - afterwards one extra call per query is captured and EXPLAIN (ANALYZE,
 *     BUFFERS) is run on every statement it issued.
 */
import { execSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { performance } from 'node:perf_hooks';
import { LoggerService } from '@libs/logger/logger.service';
import { PrismaService } from '@libs/prisma/prisma.service';
import { Client } from 'pg';
import { assertIsolatedDatabaseUrl } from '../assert-isolated-db-url';
import { CATALOG, type QuerySpec, type Tenant, tenantFor } from './catalog';
import { BASE_TENANTS, tenantCount } from './scale';
import { mulberry32, type Summary, summarize } from './stats';

const env = (key: string, fallback: string): string =>
  process.env[key] ?? fallback;
const SCALE = Number(env('LOADTEST_SCALE', '1'));
const LABEL = env('LOADTEST_LABEL', 'before');
const SAMPLES = Number(env('LOADTEST_SAMPLES', '40'));
const WARMUP = Number(env('LOADTEST_WARMUP', '5'));
const ROUNDS = Number(env('LOADTEST_ROUNDS', '3'));
const BUDGET_MS = Number(env('LOADTEST_BUDGET_MS', '20000'));
const OUT = env('LOADTEST_OUT', path.resolve(process.cwd(), 'db-load-results'));
const FILTER = process.env.LOADTEST_FILTER
  ? new RegExp(process.env.LOADTEST_FILTER)
  : null;
const STATEMENT_TIMEOUT_MS = Number(
  env('LOADTEST_STATEMENT_TIMEOUT_MS', '30000'),
);

type Statement = { params: unknown[]; sql: string };

type Result = {
  errors: { count: number; first?: string; timeouts: number };
  group: string;
  id: string;
  kind: 'typical' | 'whale' | 'global';
  plans: PlanSummary[];
  samples: number[];
  source: string;
  statementsPerCall: number;
  summary: Summary | null;
  description: string;
};

type PlanSummary = {
  bufferHit: number;
  bufferRead: number;
  executionMs: number;
  externalSort: boolean;
  nodes: string[];
  rowsRemovedByFilter: number;
  seqScans: string[];
  sql: string;
};

const logger = {
  debug() {},
  error() {},
  log() {},
  verbose() {},
  warn() {},
} as unknown as LoggerService;

function walkPlan(
  node: Record<string, unknown>,
  acc: { nodes: string[]; seq: string[]; removed: number; ext: boolean },
) {
  const type = String(node['Node Type']);
  acc.nodes.push(type);
  if (type === 'Seq Scan') acc.seq.push(String(node['Relation Name']));
  acc.removed +=
    Number(node['Rows Removed by Filter'] ?? 0) *
    Number(node['Actual Loops'] ?? 1);
  if (String(node['Sort Method'] ?? '').includes('external')) acc.ext = true;
  for (const child of (node.Plans as Record<string, unknown>[] | undefined) ??
    [])
    walkPlan(child, acc);
}

async function explain(
  url: string,
  statements: Statement[],
): Promise<PlanSummary[]> {
  const client = new Client({ connectionString: url });
  await client.connect();
  await client.query(`SET statement_timeout = ${STATEMENT_TIMEOUT_MS}`);
  const out: PlanSummary[] = [];
  for (const st of statements) {
    if (!/^\s*(SELECT|WITH)/i.test(st.sql)) continue;
    try {
      const res = await client.query(
        `EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ${st.sql}`,
        st.params as unknown[],
      );
      const root = res.rows[0]['QUERY PLAN'][0];
      const acc = {
        ext: false,
        nodes: [] as string[],
        removed: 0,
        seq: [] as string[],
      };
      walkPlan(root.Plan, acc);
      out.push({
        bufferHit: Number(root.Plan['Shared Hit Blocks'] ?? 0),
        bufferRead: Number(root.Plan['Shared Read Blocks'] ?? 0),
        executionMs: Number(root['Execution Time']),
        externalSort: acc.ext,
        nodes: [...new Set(acc.nodes)],
        rowsRemovedByFilter: acc.removed,
        seqScans: [...new Set(acc.seq)],
        sql: st.sql.replace(/\s+/g, ' ').slice(0, 400),
      });
    } catch (error) {
      out.push({
        bufferHit: 0,
        bufferRead: 0,
        executionMs: Number.NaN,
        externalSort: false,
        nodes: [`EXPLAIN failed: ${(error as Error).message.slice(0, 120)}`],
        rowsRemovedByFilter: 0,
        seqScans: [],
        sql: st.sql.replace(/\s+/g, ' ').slice(0, 400),
      });
    }
  }
  await client.end();
  return out;
}

function shuffle<T>(xs: T[], rand: () => number): T[] {
  const a = [...xs];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

describe('db load profile', () => {
  it(`profiles ${LABEL} @ ${SCALE}x`, async () => {
    const dbName = `genfeed_loadtest_${SCALE}x`;
    const baseUrl =
      process.env.LOADTEST_DATABASE_URL ??
      `postgresql://postgres@127.0.0.1:55432/${dbName}`;
    const url = assertIsolatedDatabaseUrl(baseUrl);
    process.env.DATABASE_URL = `${url}${url.includes('?') ? '&' : '?'}options=-c%20statement_timeout%3D${STATEMENT_TIMEOUT_MS}`;

    let captured: Statement[] | null = null;
    let statementCount = 0;
    const prisma = new PrismaService(
      {
        get: (k: string) => process.env[k],
        mediaUrlConfig: { cdnUrl: 'https://cdn.loadtest' },
      } as unknown as ConstructorParameters<typeof PrismaService>[0],
      {
        onQueryEvent: (event) => {
          statementCount++;
          captured?.push({
            params: JSON.parse(event.params || '[]'),
            sql: event.query,
          });
        },
      },
    );
    await prisma.$connect();

    const tenants = tenantCount(SCALE);
    const rand = mulberry32(20261105);
    const whale = tenantFor(0, SCALE);
    const pickTypical = (): Tenant =>
      tenantFor(1 + Math.floor(rand() * tenants), SCALE);

    type Job = {
      kind: Result['kind'];
      run: (t: Tenant) => Promise<unknown>;
      spec: QuerySpec;
    };
    const jobs: Job[] = [];
    for (const spec of CATALOG) {
      if (FILTER && !FILTER.test(spec.id)) continue;
      const run = spec.prepare({
        logger,
        prisma,
        scale: SCALE,
      });
      if (spec.scope === 'global') jobs.push({ kind: 'global', run, spec });
      else {
        if (!spec.whaleOnly) jobs.push({ kind: 'typical', run, spec });
        jobs.push({ kind: 'whale', run, spec });
      }
    }

    const samples = new Map<Job, number[]>();
    const errors = new Map<
      Job,
      { count: number; first?: string; timeouts: number }
    >();
    const spent = new Map<Job, number>();
    jobs.forEach((j) => {
      samples.set(j, []);
      errors.set(j, { count: 0, timeouts: 0 });
      spent.set(j, 0);
    });
    const tenantOf = (job: Job): Tenant =>
      job.kind === 'typical' ? pickTypical() : whale;

    const perRound = Math.ceil(SAMPLES / ROUNDS);
    for (let round = 0; round < ROUNDS; round++) {
      for (const job of shuffle(jobs, rand)) {
        if (
          (spent.get(job) ?? 0) > BUDGET_MS &&
          (samples.get(job)?.length ?? 0) >= 12
        )
          continue;
        const err = errors.get(job);
        if (!err) continue;
        for (let i = 0; i < WARMUP + perRound; i++) {
          const t0 = performance.now();
          try {
            await job.run(tenantOf(job));
            const ms = performance.now() - t0;
            if (i >= WARMUP) samples.get(job)?.push(ms);
            spent.set(job, (spent.get(job) ?? 0) + ms);
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            err.count++;
            if (/statement timeout|canceling statement/i.test(message))
              err.timeouts++;
            err.first ??= message.slice(0, 300);
            spent.set(job, (spent.get(job) ?? 0) + (performance.now() - t0));
            if (err.count >= 3) break; // do not hammer a query that keeps failing
          }
          if ((spent.get(job) ?? 0) > BUDGET_MS * 1.5) break;
        }
      }
      process.stdout.write(`round ${round + 1}/${ROUNDS} done\n`);
    }

    const results: Result[] = [];
    for (const job of jobs) {
      captured = [];
      statementCount = 0;
      let plans: PlanSummary[] = [];
      try {
        await job.run(tenantOf(job));
      } catch {
        // failing queries still report the statements they issued
      }
      const issued = captured;
      captured = null;
      const calls = statementCount;
      try {
        plans = await explain(url, issued);
      } catch {
        plans = [];
      }
      const s = samples.get(job) ?? [];
      results.push({
        description: job.spec.description,
        errors: errors.get(job) ?? { count: 0, timeouts: 0 },
        group: job.spec.group,
        id: job.spec.id,
        kind: job.kind,
        plans,
        samples: s,
        source: job.spec.source,
        statementsPerCall: calls,
        summary: s.length >= 3 ? summarize(s) : null,
      });
    }

    const pgVersion = (
      await prisma.$queryRawUnsafe<{ version: string }[]>('select version()')
    )[0].version;
    const dbSize = (
      await prisma.$queryRawUnsafe<{ size: string }[]>(
        'select pg_size_pretty(pg_database_size(current_database())) as size',
      )
    )[0].size;
    const rowCounts = await prisma.$queryRawUnsafe<
      { relname: string; n: number }[]
    >(
      `select relname, n_live_tup::int as n from pg_stat_user_tables where relname in ('posts','ingredients','post_analytics','activities','credit_transactions','agent_messages','workflow_executions','notification_inbox_items') order by 1`,
    );
    const git = (cmd: string) => {
      try {
        return execSync(cmd, { cwd: process.cwd() }).toString().trim();
      } catch {
        return 'unknown';
      }
    };
    fs.mkdirSync(OUT, { recursive: true });
    fs.writeFileSync(
      path.join(OUT, `${LABEL}-${SCALE}x.json`),
      JSON.stringify(
        {
          config: {
            baseTenants: BASE_TENANTS,
            budgetMs: BUDGET_MS,
            rounds: ROUNDS,
            samples: SAMPLES,
            statementTimeoutMs: STATEMENT_TIMEOUT_MS,
            warmup: WARMUP,
          },
          db: { rowCounts, size: dbSize, version: pgVersion },
          host: {
            cpus: os.cpus().length,
            cpuModel: os.cpus()[0]?.model,
            memGb: Math.round(os.totalmem() / 2 ** 30),
            node: process.version,
            platform: `${os.platform()} ${os.release()}`,
          },
          label: LABEL,
          results,
          scale: SCALE,
          source: {
            branch: git('git rev-parse --abbrev-ref HEAD'),
            commit: git('git rev-parse --short HEAD'),
            dirty: git('git status --porcelain').length > 0,
          },
          tenants,
          when: new Date().toISOString(),
        },
        null,
        2,
      ),
    );
    await prisma.$disconnect();
    expect(results.length).toBeGreaterThan(0);
  });
});
