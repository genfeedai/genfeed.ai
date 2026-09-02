/**
 * Normalize review decisions stored in Batch.items and Post.reviewEvents.
 *
 * Dry-run is the default. Pass --live to apply guarded updates. Known uppercase
 * database aliases become the canonical lowercase product vocabulary, missing
 * decisions become explicit `unset`, and unknown values remain untouched while
 * being reported by type plus a non-reversible hash (never raw content).
 */

import { createHash } from 'node:crypto';
import process from 'node:process';
import { parseReviewDecision, ReviewDecision } from '@genfeedai/contracts';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from '@libs/prisma/prisma-pg-config';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('NormalizeReviewDecisions');
const DEFAULT_BATCH_SIZE = 200;

type JsonRecord = Record<string, Prisma.JsonValue>;

export type ReviewDecisionNormalizationStats = {
  explicitUnsets: number;
  legacyAliases: number;
  unknownCategories: Record<string, number>;
};

export type ReviewDecisionJsonNormalization = {
  changed: boolean;
  stats: ReviewDecisionNormalizationStats;
  value: Prisma.JsonValue;
};

type ReviewDecisionBatchRow = {
  id: string;
  items: Prisma.JsonValue;
  organizationId: string;
  updatedAt: Date;
};

type ReviewDecisionPostRow = {
  id: string;
  organizationId: string;
  reviewEvents: Prisma.JsonValue;
  updatedAt: Date;
};

function emptyStats(): ReviewDecisionNormalizationStats {
  return { explicitUnsets: 0, legacyAliases: 0, unknownCategories: {} };
}

function isJsonRecord(
  value: Prisma.JsonValue | undefined,
): value is JsonRecord {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function unknownCategory(value: unknown): string {
  const type = Array.isArray(value)
    ? 'array'
    : value === null
      ? 'null'
      : typeof value;
  let encoded: string;
  try {
    encoded = JSON.stringify(value) ?? String(value);
  } catch {
    encoded = `[unserializable:${type}]`;
  }
  const digest = createHash('sha256')
    .update(encoded)
    .digest('hex')
    .slice(0, 12);
  return `${type}:${digest}`;
}

function recordUnknown(
  stats: ReviewDecisionNormalizationStats,
  value: unknown,
): void {
  const category = unknownCategory(value);
  stats.unknownCategories[category] =
    (stats.unknownCategories[category] ?? 0) + 1;
}

function normalizeDecisionField(
  value: Prisma.JsonValue | undefined,
  stats: ReviewDecisionNormalizationStats,
): { changed: boolean; value: Prisma.JsonValue } {
  const parsed = parseReviewDecision(value);
  if (parsed.kind === 'unknown') {
    recordUnknown(stats, value);
    return { changed: false, value: value ?? ReviewDecision.UNSET };
  }
  if (parsed.kind === 'legacy_alias') {
    stats.legacyAliases += 1;
    return { changed: true, value: parsed.decision };
  }
  if (parsed.kind === 'unset' && value !== ReviewDecision.UNSET) {
    stats.explicitUnsets += 1;
    return { changed: true, value: ReviewDecision.UNSET };
  }
  return { changed: false, value: parsed.decision };
}

function normalizeEventArray(
  value: Prisma.JsonValue | undefined,
  stats: ReviewDecisionNormalizationStats,
): { changed: boolean; value: Prisma.JsonValue } {
  if (value === undefined) return { changed: false, value: [] };
  if (!Array.isArray(value)) {
    recordUnknown(stats, value);
    return { changed: false, value };
  }

  let changed = false;
  const events = value.map((event) => {
    if (!isJsonRecord(event)) {
      recordUnknown(stats, event);
      return event;
    }
    const decision = normalizeDecisionField(event.decision, stats);
    changed ||= decision.changed;
    return decision.changed ? { ...event, decision: decision.value } : event;
  });
  return { changed, value: events };
}

export function normalizeBatchReviewDecisions(
  value: Prisma.JsonValue,
): ReviewDecisionJsonNormalization {
  const stats = emptyStats();
  if (!Array.isArray(value)) {
    recordUnknown(stats, value);
    return { changed: false, stats, value };
  }

  let changed = false;
  const items = value.map((item) => {
    if (!isJsonRecord(item)) {
      recordUnknown(stats, item);
      return item;
    }
    const decision = normalizeDecisionField(item.reviewDecision, stats);
    const events = normalizeEventArray(item.reviewEvents, stats);
    changed ||= decision.changed || events.changed;
    if (!decision.changed && !events.changed) return item;
    return {
      ...item,
      reviewDecision: decision.value,
      reviewEvents: events.value,
    };
  });

  return { changed, stats, value: items };
}

export function normalizePostReviewEvents(
  value: Prisma.JsonValue,
): ReviewDecisionJsonNormalization {
  const stats = emptyStats();
  const normalized = normalizeEventArray(value, stats);
  return { changed: normalized.changed, stats, value: normalized.value };
}

export function parseReviewDecisionNormalizationArgs(args: readonly string[]): {
  batchSize: number;
  dryRun: boolean;
} {
  const batchArg = args
    .find((arg) => arg.startsWith('--batch='))
    ?.split('=')[1];
  const parsedBatch = batchArg ? Number.parseInt(batchArg, 10) : NaN;
  return {
    batchSize:
      Number.isFinite(parsedBatch) && parsedBatch > 0
        ? parsedBatch
        : DEFAULT_BATCH_SIZE,
    dryRun: !args.includes('--live'),
  };
}

function mergeStats(
  target: ReviewDecisionNormalizationStats,
  source: ReviewDecisionNormalizationStats,
): void {
  target.explicitUnsets += source.explicitUnsets;
  target.legacyAliases += source.legacyAliases;
  for (const [category, count] of Object.entries(source.unknownCategories)) {
    target.unknownCategories[category] =
      (target.unknownCategories[category] ?? 0) + count;
  }
}

async function main(): Promise<void> {
  const { batchSize, dryRun } = parseReviewDecisionNormalizationArgs(
    process.argv.slice(2),
  );
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to normalize review decisions.');
  }

  // TLS is resolved through the same factory `PrismaService` uses rather than
  // handing the raw URL to the adapter. RDS forces SSL and pg 8.22 treats
  // `sslmode=require` as `verify-full`, so a connection string that works for
  // the deployed API fails from a laptop, which has no bundled CA at
  // `/certs/rds-ca.pem`.
  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      createPrismaPgConfig(connectionString, {
        caFilePaths: POSTGRES_CA_FILE_ENV_KEYS.map((key) => process.env[key]),
      }),
    ),
    log: ['error'],
  });
  const totals = {
    batchesChanged: 0,
    batchesScanned: 0,
    concurrentChanges: 0,
    postsChanged: 0,
    postsScanned: 0,
    stats: emptyStats(),
  };

  logger.log(
    `Starting review decision normalization (${dryRun ? 'DRY-RUN' : 'LIVE'}), batch size ${batchSize}`,
  );

  try {
    let batchCursor = '';
    for (;;) {
      const rows = await prisma.$queryRaw<ReviewDecisionBatchRow[]>(Prisma.sql`
        SELECT id, "organizationId", items, "updatedAt"
        FROM batches
        WHERE id > ${batchCursor}
          AND "isDeleted" = false
        ORDER BY id ASC
        LIMIT ${batchSize}
      `);
      if (rows.length === 0) break;

      for (const row of rows) {
        totals.batchesScanned += 1;
        const normalized = normalizeBatchReviewDecisions(row.items);
        mergeStats(totals.stats, normalized.stats);
        if (Object.keys(normalized.stats.unknownCategories).length > 0) {
          process.stdout.write(
            `${JSON.stringify({
              id: row.id,
              kind: 'batch',
              organizationId: row.organizationId,
              unknownCategories: normalized.stats.unknownCategories,
            })}\n`,
          );
        }
        if (!normalized.changed) continue;
        totals.batchesChanged += 1;
        if (dryRun) continue;

        const updated = await prisma.$executeRaw(Prisma.sql`
          UPDATE batches
          SET items = ${JSON.stringify(normalized.value)}::jsonb,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ${row.id}
            AND "organizationId" = ${row.organizationId}
            AND "isDeleted" = false
            AND "updatedAt" = ${row.updatedAt}
            AND items = ${JSON.stringify(row.items)}::jsonb
        `);
        totals.concurrentChanges += Number(updated !== 1);
      }
      batchCursor = rows.at(-1)?.id ?? batchCursor;
    }

    let postCursor = '';
    for (;;) {
      const rows = await prisma.$queryRaw<ReviewDecisionPostRow[]>(Prisma.sql`
        SELECT id, "organizationId", "reviewEvents", "updatedAt"
        FROM posts
        WHERE id > ${postCursor}
          AND "isDeleted" = false
        ORDER BY id ASC
        LIMIT ${batchSize}
      `);
      if (rows.length === 0) break;

      for (const row of rows) {
        totals.postsScanned += 1;
        const normalized = normalizePostReviewEvents(row.reviewEvents);
        mergeStats(totals.stats, normalized.stats);
        if (Object.keys(normalized.stats.unknownCategories).length > 0) {
          process.stdout.write(
            `${JSON.stringify({
              id: row.id,
              kind: 'post',
              organizationId: row.organizationId,
              unknownCategories: normalized.stats.unknownCategories,
            })}\n`,
          );
        }
        if (!normalized.changed) continue;
        totals.postsChanged += 1;
        if (dryRun) continue;

        const updated = await prisma.$executeRaw(Prisma.sql`
          UPDATE posts
          SET "reviewEvents" = ${JSON.stringify(normalized.value)}::jsonb,
              "updatedAt" = CURRENT_TIMESTAMP
          WHERE id = ${row.id}
            AND "organizationId" = ${row.organizationId}
            AND "isDeleted" = false
            AND "updatedAt" = ${row.updatedAt}
            AND "reviewEvents" = ${JSON.stringify(row.reviewEvents)}::jsonb
        `);
        totals.concurrentChanges += Number(updated !== 1);
      }
      postCursor = rows.at(-1)?.id ?? postCursor;
    }

    const unknownCount = Object.values(totals.stats.unknownCategories).reduce(
      (sum, count) => sum + count,
      0,
    );
    process.stdout.write(
      `${JSON.stringify({ summary: { ...totals, dryRun, unknownCount } })}\n`,
    );

    if (!dryRun && (unknownCount > 0 || totals.concurrentChanges > 0)) {
      throw new Error(
        `Review decision normalization did not converge: ${unknownCount} unknown values, ${totals.concurrentChanges} concurrent changes. Resolve the reported categories and rerun safely.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    logger.error('Review decision normalization failed', error);
    process.exit(1);
  });
}
