/**
 * Backfill metadataId on Ingredient rows where it is NULL.
 *
 * AUTHORIZATION REQUIRED — do NOT run against production without explicit
 * sign-off from the engineering lead. Production runs must be preceded by a
 * dry-run to verify the candidate count and recovery strategy.
 *
 * Recovery strategy
 * -----------------
 * The relation from Ingredient to Metadata is 1-to-1. We recover the link by
 * scanning every Metadata row whose `id` appears in NO ingredient's
 * `metadataId` column but whose own `ingredientId` (or reverse-relation
 * column if present) points back to an ingredient — or, where no direct
 * back-pointer exists, by heuristic matching on (organizationId, userId,
 * createdAt proximity). This script uses the safest, lossless path first:
 *
 *   1. Metadata rows that reference an ingredient via their own FK-like
 *      field are not available in this schema (Metadata has no ingredientId).
 *   2. Instead: for each ingredient with metadataId IS NULL, find Metadata
 *      rows whose mongoId matches ingredient.mongoId (set during Mongo→PG
 *      migration for rows that had a paired document), or fall back to
 *      matching on (organizationId, userId, category, created within 5s).
 *   3. VOICE category is excluded — handled separately in the voice catalog
 *      migration pipeline.
 *
 * Usage
 * -----
 *   # Dry run (default, safe) — logs candidates, writes nothing:
 *   bun run scripts/migrations/backfill-metadata-id.ts
 *
 *   # Live run — requires --live:
 *   bun run scripts/migrations/backfill-metadata-id.ts --live
 *
 *   # Target a specific environment's .env file:
 *   bun run scripts/migrations/backfill-metadata-id.ts --env=production --live
 *
 *   # Override database URL directly:
 *   bun run scripts/migrations/backfill-metadata-id.ts --database-url=postgres://... --live
 */

import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../../packages/prisma/src/index';

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------

const args = new Set(process.argv.slice(2));

const argValue = (name: string): string | undefined => {
  const prefix = `${name}=`;
  return process.argv
    .find((arg) => arg.startsWith(prefix))
    ?.slice(prefix.length);
};

const env = argValue('--env') ?? 'local';
const isLive = args.has('--live');
const BATCH_SIZE = 100;

// ---------------------------------------------------------------------------
// Env loading (same pattern as auth-provider-org-member-sync-backfill.ts)
// ---------------------------------------------------------------------------

for (const envPath of [
  resolve(__dirname, `../../.env.${env}`),
  resolve(__dirname, `../../apps/server/api/.env.${env}`),
]) {
  if (existsSync(envPath)) {
    config({ path: envPath, override: false });
  }
}

const databaseUrl = argValue('--database-url') ?? process.env.DATABASE_URL;

if (!databaseUrl) {
  throw new Error(
    `DATABASE_URL is required. Pass --database-url=... or set it via .env.${env}`,
  );
}

// ---------------------------------------------------------------------------
// Prisma client
// ---------------------------------------------------------------------------

const adapter = new PrismaPg({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter });

// ---------------------------------------------------------------------------
// Logging helpers
// ---------------------------------------------------------------------------

function log(message: string, context?: Record<string, unknown>): void {
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  process.stdout.write(`[backfill-metadata-id] ${message}${contextStr}\n`);
}

function warn(message: string, context?: Record<string, unknown>): void {
  const contextStr = context ? ` ${JSON.stringify(context)}` : '';
  process.stderr.write(`[backfill-metadata-id] WARN ${message}${contextStr}\n`);
}

// ---------------------------------------------------------------------------
// Interfaces
// ---------------------------------------------------------------------------

interface IngredientRow {
  id: string;
  mongoId: string | null;
  organizationId: string | null;
  userId: string | null;
  category: string;
  createdAt: Date;
}

interface MetadataRow {
  id: string;
  mongoId: string | null;
  organizationId: string | null;
  userId: string | null;
  createdAt: Date;
}

interface RecoveryResult {
  ingredientId: string;
  metadataId: string;
  strategy: 'mongoId' | 'proximity';
}

// ---------------------------------------------------------------------------
// Advisory lock
// Prevents concurrent runs from racing on the same batch.
// Lock key: arbitrary 64-bit int derived from the script name.
// ---------------------------------------------------------------------------

const ADVISORY_LOCK_KEY = BigInt('0xbf11dac1da1a1d00');

async function acquireAdvisoryLock(): Promise<void> {
  await prisma.$executeRaw`SELECT pg_advisory_lock(${ADVISORY_LOCK_KEY}::bigint)`;
  log('Acquired advisory lock');
}

async function releaseAdvisoryLock(): Promise<void> {
  await prisma.$executeRaw`SELECT pg_advisory_unlock(${ADVISORY_LOCK_KEY}::bigint)`;
  log('Released advisory lock');
}

// ---------------------------------------------------------------------------
// Recovery logic
// ---------------------------------------------------------------------------

/**
 * For a batch of ingredients with metadataId IS NULL, find candidate Metadata
 * rows via two strategies:
 *
 * 1. mongoId match: ingredient.mongoId === metadata.mongoId — the most reliable
 *    link because the Mongo migration preserved paired document IDs.
 *
 * 2. Proximity match: same (organizationId, userId), metadata created within
 *    5 seconds before or after the ingredient — used only when strategy 1
 *    yields nothing and exactly one candidate exists (prevents false positives).
 */
async function findRecoveries(
  ingredients: IngredientRow[],
): Promise<RecoveryResult[]> {
  const results: RecoveryResult[] = [];

  // Collect all mongoIds from this batch for a single Metadata fetch.
  const mongoIds = ingredients
    .map((i) => i.mongoId)
    .filter((id): id is string => id !== null && id.length > 0);

  const metadataByMongoId: Map<string, string> = new Map();

  if (mongoIds.length > 0) {
    const rows = await prisma.$queryRaw<Array<{ id: string; mongoId: string }>>`
      SELECT id, "mongoId"
      FROM "Metadata"
      WHERE "mongoId" = ANY(${mongoIds}::text[])
        AND "isDeleted" = false
    `;
    for (const row of rows) {
      if (row.mongoId) {
        metadataByMongoId.set(row.mongoId, row.id);
      }
    }
  }

  for (const ingredient of ingredients) {
    // Strategy 1: mongoId match
    if (ingredient.mongoId) {
      const metadataId = metadataByMongoId.get(ingredient.mongoId);
      if (metadataId) {
        results.push({
          ingredientId: ingredient.id,
          metadataId,
          strategy: 'mongoId',
        });
        continue;
      }
    }

    // Strategy 2: proximity match (safe only when exactly one candidate exists)
    if (ingredient.organizationId && ingredient.userId) {
      const windowStart = new Date(ingredient.createdAt.getTime() - 5_000);
      const windowEnd = new Date(ingredient.createdAt.getTime() + 5_000);

      const candidates = await prisma.$queryRaw<MetadataRow[]>`
        SELECT id, "mongoId", "organizationId", "userId", "createdAt"
        FROM "Metadata"
        WHERE "organizationId" = ${ingredient.organizationId}
          AND "userId" = ${ingredient.userId}
          AND "createdAt" >= ${windowStart}
          AND "createdAt" <= ${windowEnd}
          AND "isDeleted" = false
          AND id NOT IN (
            SELECT "metadataId" FROM "Ingredient"
            WHERE "metadataId" IS NOT NULL AND "isDeleted" = false
          )
        LIMIT 2
      `;

      if (candidates.length === 1 && candidates[0]) {
        results.push({
          ingredientId: ingredient.id,
          metadataId: candidates[0].id,
          strategy: 'proximity',
        });
        continue;
      }

      if (candidates.length > 1) {
        warn('Multiple proximity candidates — skipping (ambiguous)', {
          candidateCount: candidates.length,
          ingredientId: ingredient.id,
        });
      }
    }
  }

  return results;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  log('Starting backfill-metadata-id', { env, isLive });

  if (!isLive) {
    log('DRY RUN — no writes will be made. Pass --live to apply changes.');
  }

  await acquireAdvisoryLock();

  try {
    // Count total candidates (excluding VOICE — handled separately)
    const totalCount = await prisma.$queryRaw<Array<{ count: bigint }>>`
      SELECT COUNT(*) AS count
      FROM "Ingredient"
      WHERE "metadataId" IS NULL
        AND "isDeleted" = false
        AND "category" != 'VOICE'
    `;

    const total = Number(totalCount[0]?.count ?? 0);
    log(
      `Found ${total} ingredient(s) with metadataId IS NULL (VOICE excluded)`,
    );

    if (total === 0) {
      log('Nothing to backfill. Exiting.');
      return;
    }

    let offset = 0;
    let processed = 0;
    let recovered = 0;
    let unresolved = 0;

    while (offset < total) {
      const batch = await prisma.$queryRaw<IngredientRow[]>`
        SELECT id, "mongoId", "organizationId", "userId", "category", "createdAt"
        FROM "Ingredient"
        WHERE "metadataId" IS NULL
          AND "isDeleted" = false
          AND "category" != 'VOICE'
        ORDER BY "createdAt" ASC
        LIMIT ${BATCH_SIZE}
        OFFSET ${offset}
      `;

      if (batch.length === 0) {
        break;
      }

      const recoveries = await findRecoveries(batch);
      processed += batch.length;

      for (const recovery of recoveries) {
        log(`${isLive ? 'Applying' : 'Would apply'} recovery`, {
          ingredientId: recovery.ingredientId,
          metadataId: recovery.metadataId,
          strategy: recovery.strategy,
        });

        if (isLive) {
          await prisma.$executeRaw`
            UPDATE "Ingredient"
            SET "metadataId" = ${recovery.metadataId}
            WHERE id = ${recovery.ingredientId}
              AND "metadataId" IS NULL
          `;
        }

        recovered++;
      }

      const batchUnresolved = batch.length - recoveries.length;
      if (batchUnresolved > 0) {
        warn(
          `${batchUnresolved} ingredient(s) in this batch could not be recovered`,
          {
            batchOffset: offset,
          },
        );
        unresolved += batchUnresolved;
      }

      // In --live mode, recovered rows drop out of the `metadataId IS NULL`
      // result set, so only the still-unresolved rows remain ahead of the
      // cursor. Advance OFFSET by the unresolved count to avoid skipping
      // never-visited rows. In dry-run nothing is updated, so the full batch
      // stays in the set and we must step past all of it.
      offset += isLive ? batchUnresolved : batch.length;

      log(
        `Progress: ${processed}/${total} processed, ${recovered} recovered so far`,
      );
    }

    log('Backfill complete', {
      isLive,
      processed,
      recovered,
      unresolved,
    });

    if (unresolved > 0) {
      warn(
        `${unresolved} ingredient(s) could not be matched to any Metadata row. ` +
          'Review manually — these may be orphaned records from failed generation jobs.',
      );
    }
  } finally {
    await releaseAdvisoryLock();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`[backfill-metadata-id] FATAL ${message}\n`);
  process.exit(1);
});
