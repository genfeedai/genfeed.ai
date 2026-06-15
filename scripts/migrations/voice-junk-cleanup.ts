/**
 * Voice Junk Cleanup Script
 *
 * Purges 2 304 VOICE ingredient "shells" that were created during the initial
 * PostgreSQL provisioning on 2026-03-09 before the real asset migration ran.
 * These rows have no media, no metadata link, no external voice reference, and
 * are NOT referenced by any brand or persona.  They are pure garbage.
 *
 * The real voice catalog now lives in the `ExternalVoice` table (PR1).
 * The real cloned/generated voice ingredients will be migrated by
 * mongo-to-postgres.ts (Gate 6).
 *
 * Hard-delete is used (not soft-delete) because:
 *   - These rows have no mongoId and therefore no migration lineage.
 *   - They are not referenced by any real content (FK check aborts if they are).
 *   - The repo convention is `isDeleted` soft-delete for user-owned entities;
 *     junk infrastructure shells with zero content value are eligible for hard
 *     deletion — identical to what `prisma migrate deploy` does when dropping
 *     obsolete schema rows.
 *
 * Safety controls:
 *   1. Dry-run by default — pass --live to actually delete.
 *   2. Pre-flight FK check — aborts if any brand.voiceIngredientId or
 *      persona.voiceIngredientId points into the purge set.
 *   3. Count gate — aborts if matched count is outside [EXPECTED_MIN, EXPECTED_MAX].
 *      Use --expect=<n> to override the expected count when re-running after a
 *      partial manual cleanup.
 *   4. Criteria are explicit in SQL terms and logged before any write.
 *
 * WHERE clause (junk set):
 *   category = 'VOICE'
 *   AND mongoId IS NULL          -- never came from Mongo; junk shells only
 *   AND cdnUrl IS NULL           -- no media
 *   AND s3Key IS NULL            -- no media
 *   AND externalVoiceId IS NULL  -- no provider voice reference
 *   AND "createdAt" >= '2026-03-09 00:00:00Z'
 *   AND "createdAt" <  '2026-03-10 00:00:00Z'
 *
 * Usage:
 *   bun run scripts/migrations/voice-junk-cleanup.ts                          # dry-run local
 *   bun run scripts/migrations/voice-junk-cleanup.ts --env=production         # dry-run prod
 *   bun run scripts/migrations/voice-junk-cleanup.ts --env=production --live  # live prod
 *   bun run scripts/migrations/voice-junk-cleanup.ts --expect=2300 --live     # override expected count
 */

import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../../packages/prisma/src/index';

const logger = new Logger('VoiceJunkCleanup');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const envArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
const envSuffix = envArg ?? 'local';
config({ path: resolve(__dirname, `../../apps/server/api/.env.${envSuffix}`) });

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  throw new Error(`DATABASE_URL is required (loaded from .env.${envSuffix})`);
}

const DRY_RUN = !process.argv.includes('--live');

const expectArg = process.argv
  .find((a) => a.startsWith('--expect='))
  ?.split('=')[1];
// Allow ±10 % around the expected count (or custom --expect value).
const EXPECTED_COUNT =
  expectArg !== undefined ? Number.parseInt(expectArg, 10) : 2304;
const EXPECTED_MIN = Math.floor(EXPECTED_COUNT * 0.9);
const EXPECTED_MAX = Math.ceil(EXPECTED_COUNT * 1.1);

if (DRY_RUN) {
  logger.log('[DRY RUN] No rows will be deleted. Pass --live to delete.');
} else {
  logger.warn('[LIVE MODE] Rows WILL be hard-deleted from PostgreSQL.');
}

// ---------------------------------------------------------------------------
// WHERE criteria (explicit — never implicit)
// ---------------------------------------------------------------------------

// Junk window: rows were bulk-created on 2026-03-09 during initial provisioning.
const JUNK_CREATED_GTE = new Date('2026-03-09T00:00:00.000Z');
const JUNK_CREATED_LT = new Date('2026-03-10T00:00:00.000Z');

// ---------------------------------------------------------------------------
// Prisma client
// ---------------------------------------------------------------------------

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({ connectionString: DATABASE_URL! });
  // biome-ignore lint/suspicious/noExplicitAny: PrismaClient ctor accepts adapter
  return new PrismaClient({ adapter } as any);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.log('='.repeat(72));
  logger.log('Voice Junk Cleanup');
  logger.log('='.repeat(72));
  logger.log(`Mode : ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  logger.log(`Env  : ${envSuffix}`);
  logger.log(
    `Expected count (±10%): ${EXPECTED_COUNT} [${EXPECTED_MIN}–${EXPECTED_MAX}]`,
  );
  logger.log('='.repeat(72));
  logger.log('');
  logger.log('Junk-set WHERE criteria:');
  logger.log('  category = VOICE');
  logger.log('  AND mongoId IS NULL');
  logger.log('  AND cdnUrl  IS NULL');
  logger.log('  AND s3Key   IS NULL');
  logger.log('  AND externalVoiceId IS NULL');
  logger.log(`  AND createdAt >= ${JUNK_CREATED_GTE.toISOString()}`);
  logger.log(`  AND createdAt <  ${JUNK_CREATED_LT.toISOString()}`);
  logger.log('');

  const prisma = createPrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`; // connectivity check
    logger.log('Connected to PostgreSQL.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`PostgreSQL connection failed: ${msg}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // ------------------------------------------------------------------
  // Step 1: Count junk rows
  // ------------------------------------------------------------------

  const junkWhere = {
    category: 'VOICE' as const,
    mongoId: null,
    cdnUrl: null,
    s3Key: null,
    externalVoiceId: null,
    createdAt: {
      gte: JUNK_CREATED_GTE,
      lt: JUNK_CREATED_LT,
    },
  };

  // biome-ignore lint/suspicious/noExplicitAny: dynamic prisma client
  const prismaAny = prisma as any;
  const matchedCount: number = await prismaAny.ingredient.count({
    where: junkWhere,
  });

  logger.log(`Matched: ${matchedCount} rows.`);

  // ------------------------------------------------------------------
  // Step 2: Count FK dependents (brand.voiceIngredientId)
  // ------------------------------------------------------------------

  // Collect the IDs in the junk set so we can check FK references.
  // We only fetch IDs — never full rows.
  const junkIds: string[] = (
    await prismaAny.ingredient.findMany({
      where: junkWhere,
      select: { id: true },
    })
  ).map((r: { id: string }) => r.id);

  const brandFkCount: number =
    junkIds.length > 0
      ? await prismaAny.brand.count({
          where: { voiceIngredientId: { in: junkIds } },
        })
      : 0;

  const personaFkCount: number =
    junkIds.length > 0
      ? await prismaAny.persona.count({
          where: { voiceIngredientId: { in: junkIds } },
        })
      : 0;

  const totalFkDependents = brandFkCount + personaFkCount;

  logger.log(
    `FK dependents: ${totalFkDependents} (brands=${brandFkCount}, personas=${personaFkCount}).`,
  );

  // ------------------------------------------------------------------
  // Step 3: Safety gates
  // ------------------------------------------------------------------

  if (totalFkDependents > 0) {
    logger.error(
      `ABORT: ${totalFkDependents} FK dependent(s) found. ` +
        'Resolve these references before running --live. ' +
        'Run: SELECT "voiceIngredientId" FROM brands WHERE "voiceIngredientId" IN (<junk ids>)',
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  if (matchedCount < EXPECTED_MIN || matchedCount > EXPECTED_MAX) {
    logger.error(
      `ABORT: Matched count ${matchedCount} is outside the expected band ` +
        `[${EXPECTED_MIN}–${EXPECTED_MAX}]. ` +
        'If a partial cleanup was done, pass --expect=<remaining count>.',
    );
    await prisma.$disconnect();
    process.exit(1);
  }

  logger.log('');
  logger.log(
    `Matched: ${matchedCount} rows. FK dependents: ${totalFkDependents}. ` +
      (DRY_RUN ? 'Ready for --live.' : 'Proceeding with hard delete.'),
  );

  // ------------------------------------------------------------------
  // Step 4: Delete (live only)
  // ------------------------------------------------------------------

  if (DRY_RUN) {
    logger.log('');
    logger.log('[DRY RUN] No rows deleted. Run with --live to delete.');
    await prisma.$disconnect();
    return;
  }

  logger.warn(`Deleting ${matchedCount} VOICE junk rows...`);

  const result = await prismaAny.ingredient.deleteMany({ where: junkWhere });

  logger.log(`Deleted: ${result.count} rows.`);

  if (result.count !== matchedCount) {
    logger.warn(
      `Count mismatch: expected to delete ${matchedCount} but deleted ${result.count}. ` +
        'This may indicate a concurrent write. Re-run the dry-run to verify.',
    );
  } else {
    logger.log('');
    logger.log('Voice junk cleanup complete.');
  }

  // ------------------------------------------------------------------
  // Step 5: Post-delete verification (live)
  // ------------------------------------------------------------------

  const remainingCount: number = await prismaAny.ingredient.count({
    where: {
      category: 'VOICE',
      mongoId: null,
    },
  });

  logger.log(`Post-delete: VOICE rows with mongoId IS NULL: ${remainingCount}`);
  if (remainingCount > 0) {
    logger.warn(
      `${remainingCount} VOICE rows with mongoId=NULL remain. ` +
        'These may be outside the 2026-03-09 window or have other nulls populated. ' +
        'Inspect manually before Gate 6.',
    );
  }

  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
