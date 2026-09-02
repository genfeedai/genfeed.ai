/**
 * Backfill invalid values in the legacy `posts.status` String column.
 *
 * The canonical mapping is delegated to PostGroupContractService.toPostStatus
 * so this one-shot repair cannot drift from the write-path behavior fixed in
 * #2582. Valid PostStatus values are never selected or rewritten.
 *
 * Dry-run is the default. Pass `--live` to write changes.
 *
 * Usage:
 *   bun run apps/server/api/scripts/backfill-post-status.ts
 *   bun run apps/server/api/scripts/backfill-post-status.ts --batch=500
 *   bun run apps/server/api/scripts/backfill-post-status.ts --live --batch=500
 *
 * Requires DATABASE_URL in the environment. See
 * docs/post-status-backfill-runbook.md before live execution.
 */

import process from 'node:process';
import { PostGroupContractService } from '@api/collections/post-groups/services/post-group-contract.service';
import { PostStatus } from '@genfeedai/enums';
import { PrismaClient } from '@genfeedai/prisma';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from '@libs/prisma/prisma-pg-config';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('PostStatusBackfill');
const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 5_000;
const VALID_POST_STATUSES: string[] = Object.values(PostStatus);
const contractService = new PostGroupContractService();

export interface PostStatusBackfillArgs {
  batchSize: number;
  dryRun: boolean;
}

export interface PostStatusRow {
  id: string;
  status: string;
}

export interface PostStatusFindManyArgs {
  orderBy: { id: 'asc' };
  select: { id: true; status: true };
  take: number;
  where: {
    id?: { gt: string };
    status: { notIn: string[] };
  };
}

export interface PostStatusUpdateManyArgs {
  data: { status: PostStatus };
  where: {
    id: { in: string[] };
    status: string;
  };
}

export interface PostStatusUpdateManyResult {
  count: number;
}

export interface PostStatusBackfillPostDelegate {
  findMany(args: PostStatusFindManyArgs): Promise<readonly PostStatusRow[]>;
  updateMany(
    args: PostStatusUpdateManyArgs,
  ): Promise<PostStatusUpdateManyResult>;
}

export interface PostStatusBackfillClient {
  post: PostStatusBackfillPostDelegate;
}

export interface PostStatusRemapCount {
  count: number;
  sourceStatus: string;
  targetStatus: PostStatus;
}

export interface PostStatusBackfillReport {
  after: readonly PostStatusRemapCount[];
  before: readonly PostStatusRemapCount[];
  concurrentChangesSkipped: number;
  dryRun: boolean;
  remainingInvalid: number;
  scanned: number;
  updated: number;
  wouldUpdate: number;
}

interface StatusBatch {
  ids: string[];
  sourceStatus: string;
  targetStatus: PostStatus;
}

export function parseArgs(args: readonly string[]): PostStatusBackfillArgs {
  let batchSize = DEFAULT_BATCH_SIZE;
  let sawDryRun = false;
  let sawLive = false;

  for (const arg of args) {
    if (arg === '--dry-run') {
      sawDryRun = true;
      continue;
    }
    if (arg === '--live') {
      sawLive = true;
      continue;
    }
    if (arg.startsWith('--batch=')) {
      batchSize = parseBatchSize(arg.slice('--batch='.length));
      continue;
    }
    throw new Error(`Unknown argument: ${arg}`);
  }

  if (sawDryRun && sawLive) {
    throw new Error('Choose either --dry-run or --live, not both.');
  }

  return { batchSize, dryRun: !sawLive };
}

export function mapInvalidPostStatus(status: string): PostStatus {
  return contractService.toPostStatus(status);
}

export async function runPostStatusBackfill(
  client: PostStatusBackfillClient,
  args: PostStatusBackfillArgs,
): Promise<PostStatusBackfillReport> {
  const beforeCounts = new Map<string, number>();
  let concurrentChangesSkipped = 0;
  let scanned = 0;
  let updated = 0;
  let afterId: string | undefined;

  for (;;) {
    const rows = await client.post.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, status: true },
      take: args.batchSize,
      where: {
        id: afterId ? { gt: afterId } : undefined,
        status: { notIn: VALID_POST_STATUSES },
      },
    });

    if (rows.length === 0) {
      break;
    }

    scanned += rows.length;
    for (const row of rows) {
      beforeCounts.set(row.status, (beforeCounts.get(row.status) ?? 0) + 1);
    }

    if (!args.dryRun) {
      for (const batch of groupRowsBySourceStatus(rows)) {
        const result = await client.post.updateMany({
          data: { status: batch.targetStatus },
          where: {
            id: { in: batch.ids },
            status: batch.sourceStatus,
          },
        });
        updated += result.count;
        concurrentChangesSkipped += batch.ids.length - result.count;
      }
    }

    afterId = rows.at(-1)?.id;
  }

  const before = toRemapCounts(beforeCounts);
  const after = args.dryRun
    ? before
    : await inventoryInvalidPostStatuses(client, args.batchSize);

  return {
    after,
    before,
    concurrentChangesSkipped,
    dryRun: args.dryRun,
    remainingInvalid: after.reduce((total, item) => total + item.count, 0),
    scanned,
    updated,
    wouldUpdate: scanned,
  };
}

async function inventoryInvalidPostStatuses(
  client: PostStatusBackfillClient,
  batchSize: number,
): Promise<readonly PostStatusRemapCount[]> {
  const counts = new Map<string, number>();
  let afterId: string | undefined;

  for (;;) {
    const rows = await client.post.findMany({
      orderBy: { id: 'asc' },
      select: { id: true, status: true },
      take: batchSize,
      where: {
        id: afterId ? { gt: afterId } : undefined,
        status: { notIn: VALID_POST_STATUSES },
      },
    });

    if (rows.length === 0) {
      return toRemapCounts(counts);
    }

    for (const row of rows) {
      counts.set(row.status, (counts.get(row.status) ?? 0) + 1);
    }
    afterId = rows.at(-1)?.id;
  }
}

function groupRowsBySourceStatus(
  rows: readonly PostStatusRow[],
): readonly StatusBatch[] {
  const batches = new Map<string, StatusBatch>();

  for (const row of rows) {
    const existing = batches.get(row.status);
    if (existing) {
      existing.ids.push(row.id);
      continue;
    }
    batches.set(row.status, {
      ids: [row.id],
      sourceStatus: row.status,
      targetStatus: mapInvalidPostStatus(row.status),
    });
  }

  return [...batches.values()];
}

function toRemapCounts(
  counts: ReadonlyMap<string, number>,
): readonly PostStatusRemapCount[] {
  return [...counts.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([sourceStatus, count]) => ({
      count,
      sourceStatus,
      targetStatus: mapInvalidPostStatus(sourceStatus),
    }));
}

function parseBatchSize(value: string): number {
  if (!/^[1-9]\d*$/.test(value)) {
    throw new Error('--batch must be a positive integer.');
  }
  const parsed = Number.parseInt(value, 10);
  if (parsed > MAX_BATCH_SIZE) {
    throw new Error(`--batch must be at most ${MAX_BATCH_SIZE}.`);
  }
  return parsed;
}

function createBackfillClient(prisma: PrismaClient): PostStatusBackfillClient {
  return {
    post: {
      findMany: (args) => prisma.post.findMany(args),
      updateMany: (args) => prisma.post.updateMany(args),
    },
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL is required to run this backfill.');
  }

  logger.log(
    `Starting posts.status backfill (${args.dryRun ? 'DRY-RUN' : 'LIVE'}), batch size ${args.batchSize}`,
  );
  if (!args.dryRun) {
    logger.warn('LIVE mode: invalid posts.status values will be rewritten.');
  }

  // TLS is resolved through the same factory `PrismaService` uses rather than
  // handing the raw URL to the adapter. RDS forces SSL and pg 8.22 treats
  // `sslmode=require` as `verify-full`, so a connection string that works for
  // the deployed API fails from a laptop, which has no bundled CA at
  // `/certs/rds-ca.pem`.
  const prisma = new PrismaClient({
    adapter: new PrismaPg(
      createPrismaPgConfig(databaseUrl, {
        caFilePaths: POSTGRES_CA_FILE_ENV_KEYS.map((key) => process.env[key]),
      }),
    ),
    log: ['error'],
  });

  try {
    const report = await runPostStatusBackfill(
      createBackfillClient(prisma),
      args,
    );
    logger.log(`Backfill report: ${JSON.stringify(report)}`);

    if (args.dryRun && report.wouldUpdate > 0) {
      logger.log(
        'Review the mapping report, then re-run with --live to apply.',
      );
    }
    if (
      !args.dryRun &&
      (report.remainingInvalid > 0 || report.concurrentChangesSkipped > 0)
    ) {
      throw new Error(
        `Backfill needs review: remainingInvalid=${report.remainingInvalid}, concurrentChangesSkipped=${report.concurrentChangesSkipped}. Inspect the report and rerun the dry-run before retrying.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  await main().catch((error: unknown) => {
    logger.error(
      'Post status backfill failed',
      error instanceof Error ? error.stack : String(error),
    );
    process.exit(1);
  });
}
