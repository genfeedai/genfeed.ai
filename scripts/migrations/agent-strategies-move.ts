/**
 * Agent Strategies Database Move Migration
 *
 * Moves agent-strategies collection from cloud DB to agent DB,
 * renaming it to 'strategies' (the agent- prefix is redundant
 * once it lives in the agent database).
 *
 * cloud.agent-strategies → agent.strategies
 *
 * Features:
 * - Batched inserts (1000 docs per batch)
 * - Index recreation from source
 * - Document count verification
 * - Dry-run by default (pass --live to write)
 *
 * Usage:
 *   bun run scripts/migrations/agent-strategies-move.ts                        # dry-run (default)
 *   bun run scripts/migrations/agent-strategies-move.ts --live                 # actually write
 *   bun run scripts/migrations/agent-strategies-move.ts --env=staging          # dry-run staging
 *   bun run scripts/migrations/agent-strategies-move.ts --env=production --live
 */

import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { config } from 'dotenv';
import {
  type Db,
  type Document,
  type IndexDescription,
  MongoClient,
} from 'mongodb';

const logger = new Logger('AgentStrategiesMove');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const envArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
const envSuffix = envArg || 'local';
config({
  path: resolve(__dirname, `../../apps/server/api/.env.${envSuffix}`),
});

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) {
  throw new Error(`MONGODB_URL is required (loaded from .env.${envSuffix})`);
}

const DRY_RUN = !process.argv.includes('--live');
const BATCH_SIZE = 1000;

const SOURCE_DB = 'cloud';
const SOURCE_COLLECTION = 'agent-strategies';
const TARGET_DB = 'agent';
const TARGET_COLLECTION = 'strategies';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function copyIndexes(
  sourceDb: Db,
  targetDb: Db,
  sourceCol: string,
  targetCol: string,
  dryRun: boolean,
): Promise<number> {
  const sourceIndexes = await sourceDb
    .collection(sourceCol)
    .listIndexes()
    .toArray();

  const customIndexes = sourceIndexes.filter((idx) => idx.name !== '_id_');

  if (customIndexes.length === 0) {
    return 0;
  }

  if (dryRun) {
    for (const idx of customIndexes) {
      logger.log(
        `  [DRY RUN] Would create index: ${idx.name} ${JSON.stringify(idx.key)}`,
      );
    }
    return customIndexes.length;
  }

  const indexSpecs: IndexDescription[] = customIndexes.map((idx) => {
    const spec: IndexDescription = { key: idx.key };
    if (idx.unique) spec.unique = true;
    if (idx.sparse) spec.sparse = true;
    if (idx.expireAfterSeconds !== undefined)
      spec.expireAfterSeconds = idx.expireAfterSeconds;
    if (idx.partialFilterExpression)
      spec.partialFilterExpression = idx.partialFilterExpression;
    if (idx.name) spec.name = idx.name;
    return spec;
  });

  await targetDb.collection(targetCol).createIndexes(indexSpecs);
  return indexSpecs.length;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  logger.log('='.repeat(70));
  logger.log('Agent Strategies Database Move');
  logger.log('='.repeat(70));
  logger.log(`Environment : ${envSuffix}`);
  logger.log(`Mode        : ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  logger.log(
    `Move        : ${SOURCE_DB}.${SOURCE_COLLECTION} → ${TARGET_DB}.${TARGET_COLLECTION}`,
  );
  logger.log('='.repeat(70));

  const client = new MongoClient(MONGODB_URL as string);
  await client.connect();
  logger.log('Connected to MongoDB\n');

  const sourceDb = client.db(SOURCE_DB);
  const targetDb = client.db(TARGET_DB);

  // Check if source collection exists
  const sourceCollections = await sourceDb
    .listCollections({ name: SOURCE_COLLECTION })
    .toArray();

  if (sourceCollections.length === 0) {
    logger.log(
      `Source collection ${SOURCE_DB}.${SOURCE_COLLECTION} does not exist. Nothing to migrate.`,
    );
    await client.close();
    return;
  }

  const sourceCount = await sourceDb
    .collection(SOURCE_COLLECTION)
    .countDocuments();

  logger.log(`Source documents: ${sourceCount}`);

  if (sourceCount === 0) {
    logger.log('No documents to migrate. Copying indexes only.');
    const indexCount = await copyIndexes(
      sourceDb,
      targetDb,
      SOURCE_COLLECTION,
      TARGET_COLLECTION,
      DRY_RUN,
    );
    logger.log(`Indexes copied: ${indexCount}`);
    await client.close();
    logger.log('\nDone.');
    return;
  }

  // Check if target already has data
  const targetExisting = await targetDb
    .collection(TARGET_COLLECTION)
    .countDocuments();

  if (targetExisting > 0) {
    logger.warn(
      `Target ${TARGET_DB}.${TARGET_COLLECTION} already has ${targetExisting} documents. Aborting to prevent duplicates.`,
    );
    await client.close();
    process.exit(1);
  }

  // Batched copy
  if (DRY_RUN) {
    logger.log(`[DRY RUN] Would copy ${sourceCount} documents`);
  } else {
    const cursor = sourceDb.collection(SOURCE_COLLECTION).find({});
    let batch: Document[] = [];
    let inserted = 0;

    for await (const doc of cursor) {
      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        await targetDb
          .collection(TARGET_COLLECTION)
          .insertMany(batch, { ordered: false });
        inserted += batch.length;
        batch = [];

        if (inserted % 5000 === 0) {
          logger.log(`  Inserted ${inserted}/${sourceCount}...`);
        }
      }
    }

    if (batch.length > 0) {
      await targetDb
        .collection(TARGET_COLLECTION)
        .insertMany(batch, { ordered: false });
      inserted += batch.length;
    }

    logger.log(`Inserted ${inserted} documents`);
  }

  // Copy indexes
  const indexCount = await copyIndexes(
    sourceDb,
    targetDb,
    SOURCE_COLLECTION,
    TARGET_COLLECTION,
    DRY_RUN,
  );
  logger.log(`Indexes ${DRY_RUN ? 'would be ' : ''}copied: ${indexCount}`);

  // Verify
  if (!DRY_RUN) {
    const targetCount = await targetDb
      .collection(TARGET_COLLECTION)
      .countDocuments();

    logger.log('\n' + '='.repeat(70));
    logger.log('VERIFICATION');
    logger.log('='.repeat(70));
    logger.log(`Source (${SOURCE_DB}.${SOURCE_COLLECTION}): ${sourceCount}`);
    logger.log(`Target (${TARGET_DB}.${TARGET_COLLECTION}): ${targetCount}`);

    if (targetCount === sourceCount) {
      logger.log('COUNT MATCH — Migration successful');
    } else {
      logger.error(
        `COUNT MISMATCH: source=${sourceCount}, target=${targetCount}`,
      );
      await client.close();
      process.exit(1);
    }

    logger.log('\nNEXT STEPS:');
    logger.log(
      `1. Deploy the updated code (agent-strategies now reads from ${TARGET_DB}.${TARGET_COLLECTION})`,
    );
    logger.log('2. Verify the app works correctly');
    logger.log(
      `3. Drop the old collection: use ${SOURCE_DB}; db.getCollection('${SOURCE_COLLECTION}').drop()`,
    );
  }

  await client.close();
  logger.log('\nDone.');
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
