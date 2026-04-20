/**
 * S3 Post-Migration Rename Script
 *
 * After the MongoDB → PostgreSQL data migration, S3 objects keyed by MongoDB
 * ObjectIds need to be renamed to their new CUID identifiers.
 *
 * Bucket structure:
 *   cdn.genfeed.ai/
 *   ├── ingredients/images/       (key = mongoId hex, no extension)
 *   ├── ingredients/videos/
 *   ├── ingredients/musics/
 *   ├── ingredients/voices/
 *   ├── ingredients/logos/
 *   ├── ingredients/banners/
 *   ├── ingredients/references/
 *   ├── ingredients/thumbnails/
 *   ├── ingredients/trainings/    (mongoId as FOLDER name, multi-file)
 *   ├── assets/branding/
 *   └── skills/
 *
 * Total: ~870 files to rename.
 *
 * Usage:
 *   bun run scripts/migrations/s3-rename.ts                            # dry-run
 *   bun run scripts/migrations/s3-rename.ts --live                     # live rename
 *   bun run scripts/migrations/s3-rename.ts --env=production           # dry-run production
 *   bun run scripts/migrations/s3-rename.ts --env=production --live    # live production
 */

import { resolve } from 'node:path';
import {
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from '@aws-sdk/client-s3';
import { PrismaClient } from '@genfeedai/prisma';
import { Logger } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { config } from 'dotenv';

const logger = new Logger('S3Rename');

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
const S3_REGION = process.env.AWS_REGION ?? 'us-east-1';

const DRY_RUN = !process.argv.includes('--live');
const CONCURRENCY = 50;

if (DRY_RUN) {
  logger.log(
    '[DRY RUN] No S3 objects will be modified. Pass --live to rename.',
  );
} else {
  logger.warn('[LIVE MODE] S3 objects WILL be renamed.');
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RenameTask {
  sourceKey: string;
  targetKey: string;
  label: string; // human-readable identifier for logging
}

interface SummaryRow {
  category: string;
  count: number;
  isDirectories: boolean;
  failures: number;
}

// ---------------------------------------------------------------------------
// Category → S3 prefix mapping
// ---------------------------------------------------------------------------

const INGREDIENT_CATEGORY_TO_PREFIX: Record<string, string> = {
  IMAGE: 'ingredients/images',
  VIDEO: 'ingredients/videos',
  MUSIC: 'ingredients/musics',
  VOICE: 'ingredients/voices',
  AVATAR: 'ingredients/images', // avatars stored in images folder
  AUDIO: 'ingredients/voices', // speech stored in voices folder
  GIF: 'ingredients/images', // gifs stored in images folder
};

const TRAINING_PREFIX = 'ingredients/trainings';

const ASSET_CATEGORY_TO_PREFIX: Record<string, string> = {
  LOGO: 'assets/branding',
  BANNER: 'assets/branding',
  REFERENCE: 'assets/branding',
};

// ---------------------------------------------------------------------------
// Concurrency helpers
// ---------------------------------------------------------------------------

async function withConcurrency<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += concurrency) {
    chunks.push(items.slice(i, i + concurrency));
  }
  for (const chunk of chunks) {
    await Promise.all(chunk.map(fn));
  }
}

// ---------------------------------------------------------------------------
// S3 helpers
// ---------------------------------------------------------------------------

async function objectExists(s3: S3Client, key: string): Promise<boolean> {
  try {
    await s3.send(new HeadObjectCommand({ Bucket: S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

async function listObjectsWithPrefix(
  s3: S3Client,
  prefix: string,
): Promise<string[]> {
  const keys: string[] = [];
  let continuationToken: string | undefined;

  do {
    const response = await s3.send(
      new ListObjectsV2Command({
        Bucket: S3_BUCKET,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    );

    for (const obj of response.Contents ?? []) {
      if (obj.Key) {
        keys.push(obj.Key);
      }
    }

    continuationToken = response.NextContinuationToken;
  } while (continuationToken);

  return keys;
}

async function copyObject(
  s3: S3Client,
  sourceKey: string,
  targetKey: string,
): Promise<void> {
  await s3.send(
    new CopyObjectCommand({
      Bucket: S3_BUCKET,
      CopySource: `${S3_BUCKET}/${sourceKey}`,
      Key: targetKey,
    }),
  );
}

async function deleteObject(s3: S3Client, key: string): Promise<void> {
  await s3.send(new DeleteObjectCommand({ Bucket: S3_BUCKET, Key: key }));
}

// ---------------------------------------------------------------------------
// Rename execution
// ---------------------------------------------------------------------------

async function renameFile(
  s3: S3Client,
  task: RenameTask,
  failures: string[],
): Promise<boolean> {
  try {
    const exists = await objectExists(s3, task.sourceKey);

    if (!exists) {
      logger.warn(`[SKIP] Source not found: ${task.sourceKey}`);
      return false;
    }

    if (DRY_RUN) {
      logger.log(`[DRY RUN] ${task.sourceKey} → ${task.targetKey}`);
      return true;
    }

    await copyObject(s3, task.sourceKey, task.targetKey);
    await deleteObject(s3, task.sourceKey);
    logger.log(`[RENAMED] ${task.sourceKey} → ${task.targetKey}`);
    return true;
  } catch (err) {
    const msg = `${task.label}: ${task.sourceKey} → ${task.targetKey}`;
    logger.error(
      `[FAILED] ${msg}`,
      err instanceof Error ? err.message : String(err),
    );
    failures.push(msg);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Ingredient flat-file rename
// ---------------------------------------------------------------------------

interface IngredientRow {
  id: string;
  mongoId: string;
  category: string;
}

async function processIngredients(
  s3: S3Client,
  rows: IngredientRow[],
  summary: Map<string, SummaryRow>,
): Promise<string[]> {
  const failures: string[] = [];

  // Only process categories that have a known S3 prefix
  const mappedRows = rows.filter(
    (r) => INGREDIENT_CATEGORY_TO_PREFIX[r.category],
  );

  // ---- Flat files ----
  const flatTasks: RenameTask[] = mappedRows.map((r) => {
    const prefix = INGREDIENT_CATEGORY_TO_PREFIX[r.category];
    return {
      label: `ingredient:${r.category}:${r.mongoId}`,
      sourceKey: `${prefix}/${r.mongoId}`,
      targetKey: `${prefix}/${r.id}`,
    };
  });

  // Build per-category summary buckets
  const categoryTasks = new Map<string, RenameTask[]>();
  for (const task of flatTasks) {
    const cat = task.label.split(':')[1];
    if (!categoryTasks.has(cat)) categoryTasks.set(cat, []);
    categoryTasks.get(cat)!.push(task);
  }

  for (const [cat, tasks] of categoryTasks) {
    const catFailures: string[] = [];
    await withConcurrency(tasks, CONCURRENCY, async (task) => {
      await renameFile(s3, task, catFailures);
    });

    const row = summary.get(cat) ?? {
      category:
        INGREDIENT_CATEGORY_TO_PREFIX[cat]?.split('/')[1] ?? cat.toLowerCase(),
      count: 0,
      isDirectories: false,
      failures: 0,
    };
    row.count += tasks.length;
    row.failures += catFailures.length;
    summary.set(cat, row);
    failures.push(...catFailures);
  }

  return failures;
}

// ---------------------------------------------------------------------------
// Training directory rename (separate model from ingredients)
// ---------------------------------------------------------------------------

interface TrainingRow {
  id: string;
  mongoId: string;
}

async function processTrainings(
  s3: S3Client,
  rows: TrainingRow[],
  summary: Map<string, SummaryRow>,
): Promise<string[]> {
  const failures: string[] = [];
  let trainingFileCount = 0;

  await withConcurrency(rows, CONCURRENCY, async (row) => {
    try {
      const sourcePrefix = `${TRAINING_PREFIX}/${row.mongoId}/`;
      const targetPrefix = `${TRAINING_PREFIX}/${row.id}/`;

      const sourceKeys = await listObjectsWithPrefix(s3, sourcePrefix);
      if (sourceKeys.length === 0) {
        logger.warn(`[SKIP] Training dir not found: ${sourcePrefix}`);
        return;
      }

      trainingFileCount += sourceKeys.length;

      for (const sourceKey of sourceKeys) {
        const relativePath = sourceKey.slice(sourcePrefix.length);
        const targetKey = `${targetPrefix}${relativePath}`;

        const task: RenameTask = {
          label: `training:${row.mongoId}/${relativePath}`,
          sourceKey,
          targetKey,
        };

        await renameFile(s3, task, failures);
      }
    } catch (err) {
      const msg = `training:${row.mongoId} (directory)`;
      logger.error(
        `[FAILED] ${msg}`,
        err instanceof Error ? err.message : String(err),
      );
      failures.push(msg);
    }
  });

  summary.set('TRAINING', {
    category: 'trainings',
    count: rows.length,
    isDirectories: true,
    failures: failures.length,
  });

  logger.log(`Training dirs: ${rows.length} dirs, ${trainingFileCount} files`);

  return failures;
}

// ---------------------------------------------------------------------------
// Asset rename
// ---------------------------------------------------------------------------

interface AssetRow {
  id: string;
  mongoId: string;
  category: string;
}

async function processAssets(
  s3: S3Client,
  rows: AssetRow[],
  summary: Map<string, SummaryRow>,
): Promise<string[]> {
  const failures: string[] = [];

  const filteredRows = rows.filter((r) => ASSET_CATEGORY_TO_PREFIX[r.category]);

  const tasks: RenameTask[] = filteredRows.map((r) => {
    const prefix = ASSET_CATEGORY_TO_PREFIX[r.category];
    return {
      label: `asset:${r.category}:${r.mongoId}`,
      sourceKey: `${prefix}/${r.mongoId}`,
      targetKey: `${prefix}/${r.id}`,
    };
  });

  await withConcurrency(tasks, CONCURRENCY, async (task) => {
    await renameFile(s3, task, failures);
  });

  const row = summary.get('ASSET_BRANDING') ?? {
    category: 'assets/branding',
    count: 0,
    isDirectories: false,
    failures: 0,
  };
  row.count += tasks.length;
  row.failures += failures.length;
  summary.set('ASSET_BRANDING', row);

  return failures;
}

// ---------------------------------------------------------------------------
// Summary printer
// ---------------------------------------------------------------------------

function printSummary(
  summary: Map<string, SummaryRow>,
  allFailures: string[],
): void {
  const COL_CAT = 20;
  const COL_COUNT = 8;
  const COL_STATUS = 8;

  const pad = (s: string, n: number) => s.padEnd(n);
  const padL = (s: string, n: number) => s.padStart(n);

  logger.log('');
  logger.log('S3 RENAME SUMMARY');
  logger.log('═'.repeat(42));
  logger.log(
    `${pad('Category', COL_CAT)} ${padL('Count', COL_COUNT)}  ${pad('Status', COL_STATUS)}`,
  );
  logger.log(
    `${'─'.repeat(COL_CAT)} ${'─'.repeat(COL_COUNT)}  ${'─'.repeat(COL_STATUS)}`,
  );

  let totalCount = 0;
  let totalFailures = 0;

  for (const row of summary.values()) {
    const countLabel = row.isDirectories
      ? `${row.count} dirs`
      : String(row.count);
    const status = row.failures === 0 ? 'OK' : `FAIL(${row.failures})`;
    logger.log(
      `${pad(row.category, COL_CAT)} ${padL(countLabel, COL_COUNT)}  ${pad(status, COL_STATUS)}`,
    );
    totalCount += row.count;
    totalFailures += row.failures;
  }

  logger.log(
    `${'─'.repeat(COL_CAT)} ${'─'.repeat(COL_COUNT)}  ${'─'.repeat(COL_STATUS)}`,
  );
  const totalStatus = totalFailures === 0 ? 'OK' : `FAIL(${totalFailures})`;
  logger.log(
    `${pad('TOTAL', COL_CAT)} ${padL(String(totalCount), COL_COUNT)}  ${pad(totalStatus, COL_STATUS)}`,
  );
  logger.log('═'.repeat(42));

  if (allFailures.length > 0) {
    logger.error('');
    logger.error(`Failed objects (${allFailures.length}):`);
    for (const f of allFailures) {
      logger.error(`  - ${f}`);
    }
  }

  if (DRY_RUN) {
    logger.log('');
    logger.log('[DRY RUN] No changes were made. Re-run with --live to apply.');
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  logger.log(`Environment: .env.${envSuffix}`);
  logger.log(`Bucket: ${S3_BUCKET} (${S3_REGION})`);

  // --- Prisma client ---
  const adapter = new PrismaPg({ connectionString: DATABASE_URL });
  const prisma = new PrismaClient({ adapter });

  // --- S3 client ---
  const s3 = new S3Client({ region: S3_REGION });

  const summary = new Map<string, SummaryRow>();
  const allFailures: string[] = [];

  try {
    // ---- Query ingredients ----
    logger.log('Querying ingredients with mongoId...');
    const ingredients = await prisma.$queryRaw<IngredientRow[]>`
      SELECT id, "mongoId", category::text
      FROM ingredients
      WHERE "mongoId" IS NOT NULL
    `;
    logger.log(`Found ${ingredients.length} ingredient(s) with mongoId`);

    // ---- Query trainings ----
    logger.log('Querying trainings with mongoId...');
    const trainings = await prisma.$queryRaw<TrainingRow[]>`
      SELECT id, "mongoId"
      FROM trainings
      WHERE "mongoId" IS NOT NULL
    `;
    logger.log(`Found ${trainings.length} training(s) with mongoId`);

    // ---- Query assets ----
    logger.log('Querying assets with mongoId...');
    const assets = await prisma.$queryRaw<AssetRow[]>`
      SELECT id, "mongoId", category::text
      FROM assets
      WHERE "mongoId" IS NOT NULL
    `;
    logger.log(`Found ${assets.length} asset(s) with mongoId`);

    // ---- Process ingredients ----
    if (ingredients.length > 0) {
      logger.log('Processing ingredients...');
      const ingredientFailures = await processIngredients(
        s3,
        ingredients,
        summary,
      );
      allFailures.push(...ingredientFailures);
    }

    // ---- Process trainings ----
    if (trainings.length > 0) {
      logger.log('Processing training directories...');
      const trainingFailures = await processTrainings(s3, trainings, summary);
      allFailures.push(...trainingFailures);
    }

    // ---- Process assets ----
    if (assets.length > 0) {
      logger.log('Processing assets...');
      const assetFailures = await processAssets(s3, assets, summary);
      allFailures.push(...assetFailures);
    }
  } finally {
    await prisma.$disconnect();
    s3.destroy();
  }

  // ---- Print summary ----
  printSummary(summary, allFailures);

  if (allFailures.length > 0) {
    logger.error(`Migration completed with ${allFailures.length} failure(s).`);
    process.exit(1);
  } else {
    logger.log('Migration completed successfully.');
  }
}

main().catch((err) => {
  logger.error(
    'Fatal error:',
    err instanceof Error ? err.message : String(err),
  );
  process.exit(1);
});
