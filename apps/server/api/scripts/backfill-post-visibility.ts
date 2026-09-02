/**
 * Backfill Post audience visibility and repair legacy target lifecycle drift.
 *
 * Dry-run is the default. Pass `--live` to apply guarded updates. Pagination by
 * stable id makes the job resumable; source-value predicates prevent a live run
 * from overwriting rows changed concurrently by the application.
 */

import process from 'node:process';
import {
  PostStatus,
  PostVisibility,
  TargetExecutionState,
} from '@genfeedai/contracts';
import { Prisma, PrismaClient } from '@genfeedai/prisma';
import {
  createPrismaPgConfig,
  POSTGRES_CA_FILE_ENV_KEYS,
} from '@libs/prisma/prisma-pg-config';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';

const logger = new Logger('PostVisibilityBackfill');
const DEFAULT_BATCH_SIZE = 200;

const EXECUTION_STATES = new Set<string>(Object.values(TargetExecutionState));
const LEGACY_STATUSES = new Set<string>(Object.values(PostStatus));
const VISIBILITIES = new Set<string>(Object.values(PostVisibility));

export type PostVisibilityBackfillRow = {
  id: string;
  status: string;
  targetExecutionState: string;
  visibility: string | null;
};

export type PostVisibilityBackfillClassification = {
  lifecycle: TargetExecutionState;
  lifecycleChanged: boolean;
  legacyStatus: string;
  unknownLegacyStatus: boolean;
  visibility: PostVisibility;
  visibilityChanged: boolean;
};

export function parsePostVisibilityBackfillArgs(args: readonly string[]): {
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

export function classifyPostVisibilityBackfill(
  row: PostVisibilityBackfillRow,
): PostVisibilityBackfillClassification {
  const unknownLegacyStatus = !LEGACY_STATUSES.has(row.status);
  const visibility = VISIBILITIES.has(row.visibility ?? '')
    ? (row.visibility as PostVisibility)
    : legacyVisibility(row.status);
  const currentLifecycle = EXECUTION_STATES.has(row.targetExecutionState)
    ? (row.targetExecutionState as TargetExecutionState)
    : undefined;
  const lifecycle =
    !currentLifecycle || isLegacyDefaultDrift(row)
      ? legacyLifecycle(row.status)
      : currentLifecycle;

  return {
    legacyStatus: row.status,
    lifecycle,
    lifecycleChanged: row.targetExecutionState !== lifecycle,
    unknownLegacyStatus,
    visibility,
    visibilityChanged: row.visibility !== visibility,
  };
}

function isLegacyDefaultDrift(row: PostVisibilityBackfillRow): boolean {
  return (
    row.visibility === null &&
    row.targetExecutionState === TargetExecutionState.DRAFT &&
    row.status !== PostStatus.DRAFT &&
    LEGACY_STATUSES.has(row.status)
  );
}

function legacyLifecycle(status: string): TargetExecutionState {
  switch (status) {
    case PostStatus.SCHEDULED:
      return TargetExecutionState.SCHEDULED;
    case PostStatus.PENDING:
    case PostStatus.PROCESSING:
      return TargetExecutionState.PUBLISHING;
    case PostStatus.PUBLIC:
    case PostStatus.PRIVATE:
    case PostStatus.UNLISTED:
      return TargetExecutionState.PUBLISHED;
    case PostStatus.FAILED:
      return TargetExecutionState.FAILED;
    default:
      return TargetExecutionState.DRAFT;
  }
}

function legacyVisibility(status: string): PostVisibility {
  switch (status) {
    case PostStatus.PRIVATE:
      return PostVisibility.PRIVATE;
    case PostStatus.UNLISTED:
      return PostVisibility.UNLISTED;
    default:
      return PostVisibility.PUBLIC;
  }
}

async function main(): Promise<void> {
  const { batchSize, dryRun } = parsePostVisibilityBackfillArgs(
    process.argv.slice(2),
  );
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error('DATABASE_URL is required to run this backfill.');
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
  const counts = {
    concurrentChanges: 0,
    lifecycleUpdates: 0,
    rowsScanned: 0,
    rowsUpdated: 0,
    unknownLegacyStatuses: 0,
    visibilityUpdates: 0,
  };

  logger.log(
    `Starting post visibility backfill (${dryRun ? 'DRY-RUN' : 'LIVE'}), batch size ${batchSize}`,
  );

  try {
    let cursor = '';
    for (;;) {
      const rows = await prisma.$queryRaw<PostVisibilityBackfillRow[]>(
        Prisma.sql`
          SELECT id, status, "targetExecutionState", visibility
          FROM posts
          WHERE id > ${cursor}
          ORDER BY id ASC
          LIMIT ${batchSize}
        `,
      );
      if (rows.length === 0) {
        break;
      }

      for (const row of rows) {
        counts.rowsScanned += 1;
        const classification = classifyPostVisibilityBackfill(row);
        counts.unknownLegacyStatuses += Number(
          classification.unknownLegacyStatus,
        );
        counts.lifecycleUpdates += Number(classification.lifecycleChanged);
        counts.visibilityUpdates += Number(classification.visibilityChanged);

        if (
          !classification.lifecycleChanged &&
          !classification.visibilityChanged
        ) {
          continue;
        }
        counts.rowsUpdated += 1;
        if (dryRun) {
          continue;
        }

        const changed = await prisma.$executeRaw(
          Prisma.sql`
            UPDATE posts
            SET
              "targetExecutionState" = ${classification.lifecycle},
              visibility = ${classification.visibility}
            WHERE id = ${row.id}
              AND status = ${row.status}
              AND "targetExecutionState" = ${row.targetExecutionState}
              AND visibility IS NOT DISTINCT FROM ${row.visibility}
          `,
        );
        counts.concurrentChanges += Number(changed !== 1);
      }
      cursor = rows.at(-1)?.id ?? cursor;
    }

    logger.log(
      `Backfill ${dryRun ? '(dry-run) ' : ''}complete: ${JSON.stringify(counts)}`,
    );
    if (dryRun) {
      logger.log('Re-run with --live to apply the classified updates.');
      return;
    }

    const [remaining] = await prisma.$queryRaw<Array<{ count: bigint }>>(
      Prisma.sql`
        SELECT COUNT(*) AS count
        FROM posts
        WHERE visibility IS NULL
          OR visibility NOT IN ('public', 'private', 'unlisted')
          OR "targetExecutionState" NOT IN (
            'draft', 'scheduled', 'paused', 'cancelled',
            'publishing', 'published', 'failed', 'skipped'
          )
      `,
    );
    if ((remaining?.count ?? 0n) > 0n || counts.concurrentChanges > 0) {
      throw new Error(
        `Backfill did not converge: ${remaining?.count ?? 0n} unclassified rows, ${counts.concurrentChanges} concurrent changes. Re-run safely.`,
      );
    }
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    logger.error('Post visibility backfill failed', error);
    process.exit(1);
  });
}
