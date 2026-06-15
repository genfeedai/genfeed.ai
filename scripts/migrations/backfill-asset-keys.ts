/**
 * Backfill Asset Keys Script (Gate 9)
 *
 * After `s3-rename.ts` has renamed S3 objects from MongoId-keyed paths to
 * CUID-keyed paths, this script updates the `cdnUrl` and `s3Key` columns in
 * the `ingredients`, `trainings`, and `assets` PG tables to reflect the new
 * CUID-based S3 paths.
 *
 * It must run AFTER s3-rename.ts (Gate 8) and ONLY after that script reports
 * zero failures.  Running it before the S3 rename will leave cdnUrls pointing
 * to non-existent CUID keys.
 *
 * Strategy:
 *   For each ingredient/training/asset row with a non-null mongoId, derive the
 *   expected new S3 key from the category prefix + the row's PG `id` (cuid),
 *   and update cdnUrl / s3Key to match.
 *
 * Dry-run by default; --live to write.
 * Idempotent: rows that already have a non-Mongo cdnUrl are logged and skipped.
 *
 * Bucket: cdn.genfeed.ai (us-west-1)
 * CDN base: https://cdn.genfeed.ai
 *
 * Usage:
 *   bun run scripts/migrations/backfill-asset-keys.ts                          # dry-run local
 *   bun run scripts/migrations/backfill-asset-keys.ts --env=production         # dry-run prod
 *   bun run scripts/migrations/backfill-asset-keys.ts --env=production --live  # live prod
 */

import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';
import { PrismaClient } from '../../packages/prisma/src/index';
import { normalizePgUrl } from './_pg-ssl';

const logger = new Logger('BackfillAssetKeys');

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

const S3_BUCKET = process.env.AWS_S3_BUCKET ?? 'cdn.genfeed.ai';
// cdn.genfeed.ai is hosted in us-west-1 — not us-east-1.
const S3_REGION = process.env.AWS_REGION ?? 'us-west-1';

const CDN_BASE = `https://${S3_BUCKET}`;

const DRY_RUN = !process.argv.includes('--live');

if (DRY_RUN) {
  logger.log('[DRY RUN] No rows will be updated. Pass --live to update.');
} else {
  logger.warn('[LIVE MODE] Rows WILL be updated in PostgreSQL.');
}

logger.log(`Bucket : ${S3_BUCKET} (${S3_REGION})`);

// ---------------------------------------------------------------------------
// Category → S3 prefix mapping (must match s3-rename.ts)
// ---------------------------------------------------------------------------

const INGREDIENT_CATEGORY_TO_PREFIX: Record<string, string> = {
  IMAGE: 'ingredients/images',
  VIDEO: 'ingredients/videos',
  MUSIC: 'ingredients/musics',
  VOICE: 'ingredients/voices',
  AVATAR: 'ingredients/images',
  AUDIO: 'ingredients/voices',
  GIF: 'ingredients/images',
};

const ASSET_CATEGORY_TO_PREFIX: Record<string, string> = {
  LOGO: 'ingredients/logos',
  BANNER: 'ingredients/banners',
  REFERENCE: 'ingredients/references',
};

// ---------------------------------------------------------------------------
// Prisma client
// ---------------------------------------------------------------------------

function createPrismaClient(): PrismaClient {
  const adapter = new PrismaPg({
    connectionString: normalizePgUrl(DATABASE_URL!),
  });
  // biome-ignore lint/suspicious/noExplicitAny: PrismaClient ctor accepts adapter
  return new PrismaClient({ adapter } as any);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Returns true if cdnUrl still uses a Mongo ObjectId hex (24 lowercase hex chars). */
function isMongoUrl(url: string): boolean {
  return /\/[0-9a-f]{24}$/.test(url);
}

/** Build new cdnUrl from CDN base, prefix, and CUID id. */
function buildCdnUrl(prefix: string, id: string): string {
  return `${CDN_BASE}/${prefix}/${id}`;
}

/** Build new s3Key from prefix and CUID id. */
function buildS3Key(prefix: string, id: string): string {
  return `${prefix}/${id}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.log('='.repeat(72));
  logger.log('Backfill Asset Keys (cdnUrl / s3Key → CUID paths)');
  logger.log('='.repeat(72));
  logger.log(`Mode : ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  logger.log(`Env  : ${envSuffix}`);
  logger.log(`CDN  : ${CDN_BASE}`);
  logger.log('='.repeat(72));

  const prisma = createPrismaClient();
  try {
    await prisma.$queryRaw`SELECT 1`;
    logger.log('Connected to PostgreSQL.');
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`PostgreSQL connection failed: ${msg}`);
    await prisma.$disconnect();
    process.exit(1);
  }

  // biome-ignore lint/suspicious/noExplicitAny: dynamic prisma client
  const prismaAny = prisma as any;

  let totalUpdated = 0;
  let totalSkipped = 0;
  let totalNoPrefix = 0;

  // ------------------------------------------------------------------
  // Ingredients
  // ------------------------------------------------------------------

  logger.log('');
  logger.log('─'.repeat(60));
  logger.log('Ingredients');
  logger.log('─'.repeat(60));

  const ingredients: Array<{
    id: string;
    mongoId: string;
    category: string;
    cdnUrl: string | null;
    s3Key: string | null;
  }> = await prismaAny.ingredient.findMany({
    where: { mongoId: { not: null } },
    select: {
      id: true,
      mongoId: true,
      category: true,
      cdnUrl: true,
      s3Key: true,
    },
  });

  logger.log(`Found ${ingredients.length} ingredients with mongoId.`);

  let ingUpdated = 0;
  let ingSkipped = 0;

  for (const row of ingredients) {
    const prefix = INGREDIENT_CATEGORY_TO_PREFIX[row.category];
    if (!prefix) {
      totalNoPrefix++;
      continue;
    }

    // Skip if cdnUrl already uses a CUID path
    if (row.cdnUrl && !isMongoUrl(row.cdnUrl)) {
      ingSkipped++;
      continue;
    }

    const newCdnUrl = buildCdnUrl(prefix, row.id);
    const newS3Key = buildS3Key(prefix, row.id);

    if (DRY_RUN) {
      logger.log(
        `  [DRY RUN] ${row.category} ${row.id}: ${row.cdnUrl ?? '(null)'} → ${newCdnUrl}`,
      );
    } else {
      await prismaAny.ingredient.update({
        where: { id: row.id },
        data: { cdnUrl: newCdnUrl, s3Key: newS3Key },
      });
      logger.log(`  [UPDATED] ${row.category} ${row.id}: → ${newCdnUrl}`);
    }

    ingUpdated++;
  }

  logger.log(`Ingredients: ${ingUpdated} updated, ${ingSkipped} already CUID.`);
  totalUpdated += ingUpdated;
  totalSkipped += ingSkipped;

  // ------------------------------------------------------------------
  // Trainings — update s3Key (CDN URLs for trainings are per-file, not row-level)
  // ------------------------------------------------------------------

  logger.log('');
  logger.log('─'.repeat(60));
  logger.log('Trainings (s3Key prefix only)');
  logger.log('─'.repeat(60));

  const trainings: Array<{
    id: string;
    mongoId: string;
    s3Key: string | null;
  }> = await prismaAny.training.findMany({
    where: { mongoId: { not: null } },
    select: { id: true, mongoId: true, s3Key: true },
  });

  logger.log(`Found ${trainings.length} trainings with mongoId.`);

  let trainUpdated = 0;
  let trainSkipped = 0;

  for (const row of trainings) {
    const prefix = `ingredients/trainings/${row.id}`;

    // s3Key for a training is the directory prefix
    if (row.s3Key && !isMongoUrl(row.s3Key)) {
      trainSkipped++;
      continue;
    }

    if (DRY_RUN) {
      logger.log(`  [DRY RUN] training ${row.id}: s3Key → ${prefix}/`);
    } else {
      await prismaAny.training.update({
        where: { id: row.id },
        data: { s3Key: prefix },
      });
      logger.log(`  [UPDATED] training ${row.id}: s3Key → ${prefix}/`);
    }

    trainUpdated++;
  }

  logger.log(
    `Trainings: ${trainUpdated} updated, ${trainSkipped} already CUID.`,
  );
  totalUpdated += trainUpdated;
  totalSkipped += trainSkipped;

  // ------------------------------------------------------------------
  // Assets (brand assets: LOGO, BANNER, REFERENCE)
  // ------------------------------------------------------------------

  logger.log('');
  logger.log('─'.repeat(60));
  logger.log('Assets');
  logger.log('─'.repeat(60));

  const assets: Array<{
    id: string;
    mongoId: string;
    category: string;
    cdnUrl: string | null;
    s3Key: string | null;
  }> = await prismaAny.asset.findMany({
    where: { mongoId: { not: null } },
    select: {
      id: true,
      mongoId: true,
      category: true,
      cdnUrl: true,
      s3Key: true,
    },
  });

  logger.log(`Found ${assets.length} assets with mongoId.`);

  let assetUpdated = 0;
  let assetSkipped = 0;

  for (const row of assets) {
    const prefix = ASSET_CATEGORY_TO_PREFIX[row.category];
    if (!prefix) {
      totalNoPrefix++;
      continue;
    }

    if (row.cdnUrl && !isMongoUrl(row.cdnUrl)) {
      assetSkipped++;
      continue;
    }

    const newCdnUrl = buildCdnUrl(prefix, row.id);
    const newS3Key = buildS3Key(prefix, row.id);

    if (DRY_RUN) {
      logger.log(
        `  [DRY RUN] ${row.category} asset ${row.id}: ${row.cdnUrl ?? '(null)'} → ${newCdnUrl}`,
      );
    } else {
      await prismaAny.asset.update({
        where: { id: row.id },
        data: { cdnUrl: newCdnUrl, s3Key: newS3Key },
      });
      logger.log(`  [UPDATED] ${row.category} asset ${row.id}: → ${newCdnUrl}`);
    }

    assetUpdated++;
  }

  logger.log(`Assets: ${assetUpdated} updated, ${assetSkipped} already CUID.`);
  totalUpdated += assetUpdated;
  totalSkipped += assetSkipped;

  // ------------------------------------------------------------------
  // Summary
  // ------------------------------------------------------------------

  logger.log('');
  logger.log('='.repeat(72));
  logger.log(`Total updated : ${totalUpdated}`);
  logger.log(`Total skipped : ${totalSkipped} (already CUID)`);
  logger.log(
    `No prefix     : ${totalNoPrefix} (category not in S3 prefix map)`,
  );
  if (DRY_RUN) {
    logger.log('[DRY RUN] No rows were written. Re-run with --live to apply.');
  } else {
    logger.log('Backfill complete.');
  }
  logger.log('='.repeat(72));

  await prisma.$disconnect();
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
