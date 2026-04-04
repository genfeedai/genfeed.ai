/**
 * Database Split Migration Script
 *
 * Migrates data from a single `genfeed` MongoDB database into 10 separate
 * databases on the same Atlas cluster. Each target database receives a subset
 * of collections as defined in the DB_MAPPING below.
 *
 * Features:
 * - Batched inserts (1000 docs per batch) for performance
 * - Index recreation from source
 * - Document count verification
 * - Dry-run by default (pass --live to write)
 * - Continues on error, reports all failures at end
 * - Final summary table
 *
 * Prerequisites:
 * - MONGODB_URL in cloud/apps/server/api/.env.{local|production}
 *
 * Usage:
 *   bun run cloud/scripts/migrations/db-split-migration.ts                        # dry-run (default)
 *   bun run cloud/scripts/migrations/db-split-migration.ts --live                 # actually write
 *   bun run cloud/scripts/migrations/db-split-migration.ts --env=production       # dry-run production
 *   bun run cloud/scripts/migrations/db-split-migration.ts --env=production --live
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

const logger = new Logger('DbSplitMigration');

// ---------------------------------------------------------------------------
// Environment
// ---------------------------------------------------------------------------

const envArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
const envSuffix = envArg || 'local';
config({ path: resolve(__dirname, `../../apps/server/api/.env.${envSuffix}`) });

const MONGODB_URL = process.env.MONGODB_URL;
if (!MONGODB_URL) {
  throw new Error(`MONGODB_URL is required (loaded from .env.${envSuffix})`);
}

const DRY_RUN = !process.argv.includes('--live');
const BATCH_SIZE = 1000;

// ---------------------------------------------------------------------------
// Collection → Database Mapping
// ---------------------------------------------------------------------------

const DB_MAPPING: Record<string, string[]> = {
  agent: ['rooms', 'messages', 'strategies'],
  analytics: [
    'analytics',
    'post-analytics',
    'article-analytics',
    'forecasts',
    'insights',
  ],
  auth: [
    'users',
    'organizations',
    'members',
    'roles',
    'settings',
    'organization-settings',
    'customers',
    'profiles',
    'subscriptions',
    'subscription-attributions',
    'api-keys',
    'credit-balances',
    'credit-transactions',
    'user-credit-balances',
    'user-credit-transactions',
    'user-subscriptions',
  ],
  clips: ['clip-projects', 'clip-results'],
  cloud: [
    'articles',
    'article-versions',
    'activities',
    'assets',
    'avatars',
    'knowledge-bases',
    'bookmarks',
    'bots',
    'brands',
    'captions',
    'outreach-campaigns',
    'content-intelligence',
    'contexts',
    'evaluations',
    'folders',
    'gifs',
    'images',
    'ingredients',
    'links',
    'metadata',
    'musics',
    'optimizers',
    'personas',
    'posts',
    'presets',
    'prompts',
    'remote-studios',
    'schedules',
    'speech',
    'tags',
    'tasks',
    'tracked-links',
    'trainings',
    'transcripts',
    'videos',
    'votes',
    'watchlists',
    'workflows',
    'workflow-executions',
    'models',
    'elements',
    'element-blacklists',
    'element-camera-movements',
    'element-cameras',
    'element-lenses',
    'element-lightings',
    'element-moods',
    'element-scenes',
    'element-sounds',
    'element-styles',
    'templates',
    'template-metadata',
    'trends',
    'trending-videos',
    'trending-hashtags',
    'trending-sounds',
    'trend-preferences',
    'font-families',
  ],
  crm: ['leads', 'companies', 'tasks', 'cost-records', 'revenue-records'],
  fanvue: [
    'fanvue-subscribers',
    'fanvue-content',
    'fanvue-earnings',
    'fanvue-schedules',
    'fanvue-sync-logs',
  ],
  marketplace: ['sellers', 'listings', 'purchases'],
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MigrationResult {
  db: string;
  collection: string;
  sourceDocs: number;
  targetDocs: number;
  indexesCreated: number;
  status: 'OK' | 'MISMATCH' | 'SKIPPED' | 'ERROR';
  error?: string;
}

interface DbSummary {
  db: string;
  collections: number;
  totalDocs: number;
  status: 'OK' | 'MISMATCH' | 'ERROR';
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Build a connection URI for a target database by replacing the DB name
 * in the original URI. Handles both formats:
 *   mongodb+srv://user:pass@cluster/dbname?options
 *   mongodb://user:pass@host:port/dbname?options
 */
function _buildTargetUri(sourceUri: string, targetDbName: string): string {
  const url = new URL(sourceUri);
  // The pathname is /dbname — replace it
  url.pathname = `/${targetDbName}`;
  return url.toString();
}

/**
 * Get the source database name from the URI.
 */
function getSourceDbName(uri: string): string {
  const url = new URL(uri);
  // pathname is /dbname
  const dbName = url.pathname.replace(/^\//, '');
  return dbName || 'genfeed';
}

/**
 * Copy all indexes from a source collection to a target collection,
 * skipping the default _id index.
 */
async function copyIndexes(
  sourceDb: Db,
  targetDb: Db,
  collectionName: string,
  dryRun: boolean,
): Promise<number> {
  const sourceIndexes = await sourceDb
    .collection(collectionName)
    .listIndexes()
    .toArray();

  // Filter out the default _id index — MongoDB creates it automatically
  const customIndexes = sourceIndexes.filter((idx) => idx.name !== '_id_');

  if (customIndexes.length === 0) {
    return 0;
  }

  if (dryRun) {
    for (const idx of customIndexes) {
      logger.log(
        `    [DRY RUN] Would create index: ${idx.name} ${JSON.stringify(idx.key)}`,
      );
    }
    return customIndexes.length;
  }

  const indexSpecs: IndexDescription[] = customIndexes.map((idx) => {
    const spec: IndexDescription = { key: idx.key };
    if (idx.unique) {
      spec.unique = true;
    }
    if (idx.sparse) {
      spec.sparse = true;
    }
    if (idx.expireAfterSeconds !== undefined) {
      spec.expireAfterSeconds = idx.expireAfterSeconds;
    }
    if (idx.partialFilterExpression) {
      spec.partialFilterExpression = idx.partialFilterExpression;
    }
    if (idx.name) {
      spec.name = idx.name;
    }
    // Text index options
    const specRecord = spec as Record<string, unknown>;
    if (idx.weights) {
      specRecord.weights = idx.weights;
    }
    if (idx.default_language) {
      specRecord.default_language = idx.default_language;
    }
    if (idx.language_override) {
      specRecord.language_override = idx.language_override;
    }
    if (idx.textIndexVersion) {
      specRecord.textIndexVersion = idx.textIndexVersion;
    }
    return spec;
  });

  await targetDb.collection(collectionName).createIndexes(indexSpecs);
  return indexSpecs.length;
}

/**
 * Migrate a single collection from source to target using batched inserts.
 */
async function migrateCollection(
  sourceDb: Db,
  targetDb: Db,
  collectionName: string,
  dryRun: boolean,
): Promise<MigrationResult> {
  const dbName = targetDb.databaseName;
  const result: MigrationResult = {
    collection: collectionName,
    db: dbName,
    indexesCreated: 0,
    sourceDocs: 0,
    status: 'OK',
    targetDocs: 0,
  };

  try {
    // Check if source collection exists
    const sourceCollections = await sourceDb
      .listCollections({ name: collectionName })
      .toArray();

    if (sourceCollections.length === 0) {
      logger.log(`  [SKIP] ${collectionName} — not found in source`);
      result.status = 'SKIPPED';
      return result;
    }

    const sourceCount = await sourceDb
      .collection(collectionName)
      .countDocuments();
    result.sourceDocs = sourceCount;

    logger.log(`  ${collectionName}: ${sourceCount} documents`);

    if (sourceCount === 0) {
      logger.log(`    Empty collection, skipping data copy`);
      // Still copy indexes for empty collections
      result.indexesCreated = await copyIndexes(
        sourceDb,
        targetDb,
        collectionName,
        dryRun,
      );
      return result;
    }

    if (dryRun) {
      logger.log(`    [DRY RUN] Would copy ${sourceCount} documents`);
      result.indexesCreated = await copyIndexes(
        sourceDb,
        targetDb,
        collectionName,
        dryRun,
      );
      result.targetDocs = sourceCount; // Assume match for dry run
      return result;
    }

    // Batched insert
    const cursor = sourceDb.collection(collectionName).find({});
    let batch: Document[] = [];
    let inserted = 0;

    for await (const doc of cursor) {
      batch.push(doc);

      if (batch.length >= BATCH_SIZE) {
        await targetDb
          .collection(collectionName)
          .insertMany(batch, { ordered: false });
        inserted += batch.length;
        batch = [];

        // Progress for large collections
        if (inserted % 10000 === 0) {
          logger.log(`    Inserted ${inserted}/${sourceCount}...`);
        }
      }
    }

    // Insert remaining docs
    if (batch.length > 0) {
      await targetDb
        .collection(collectionName)
        .insertMany(batch, { ordered: false });
      inserted += batch.length;
    }

    logger.log(`    Inserted ${inserted} documents`);

    // Copy indexes
    result.indexesCreated = await copyIndexes(
      sourceDb,
      targetDb,
      collectionName,
      dryRun,
    );
    if (result.indexesCreated > 0) {
      logger.log(`    Created ${result.indexesCreated} indexes`);
    }

    // Verify count
    const targetCount = await targetDb
      .collection(collectionName)
      .countDocuments();
    result.targetDocs = targetCount;

    if (targetCount !== sourceCount) {
      logger.error(
        `    MISMATCH: source=${sourceCount}, target=${targetCount}`,
      );
      result.status = 'MISMATCH';
    } else {
      logger.log(`    Verified: ${targetCount} documents`);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error(`    ERROR: ${message}`);
    result.status = 'ERROR';
    result.error = message;
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const sourceDbName = getSourceDbName(MONGODB_URL);
  const totalCollections = Object.values(DB_MAPPING).reduce(
    (sum, cols) => sum + cols.length,
    0,
  );
  const targetDbs = Object.keys(DB_MAPPING);

  logger.log('='.repeat(70));
  logger.log('Database Split Migration');
  logger.log('='.repeat(70));
  logger.log(`Source database : ${sourceDbName}`);
  logger.log(`Target databases: ${targetDbs.length} (${targetDbs.join(', ')})`);
  logger.log(`Total collections: ${totalCollections}`);
  logger.log(`Batch size      : ${BATCH_SIZE}`);
  logger.log(`Mode            : ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  logger.log('='.repeat(70));

  if (DRY_RUN) {
    logger.log('\n*** DRY RUN — no data will be written ***\n');
  }

  // Connect to source
  const sourceClient = new MongoClient(MONGODB_URL);
  await sourceClient.connect();
  logger.log('Connected to source cluster\n');

  const sourceDb = sourceClient.db(sourceDbName);
  const allResults: MigrationResult[] = [];
  const errors: MigrationResult[] = [];

  // Process each target database
  for (const [dbName, collections] of Object.entries(DB_MAPPING)) {
    const targetDbName = dbName;
    logger.log(`\n${'─'.repeat(70)}`);
    logger.log(`Target: ${targetDbName} (${collections.length} collections)`);
    logger.log('─'.repeat(70));

    // Use the same client — just switch DB name on the same cluster
    const targetDb = sourceClient.db(targetDbName);

    for (const collectionName of collections) {
      const result = await migrateCollection(
        sourceDb,
        targetDb,
        collectionName,
        DRY_RUN,
      );
      allResults.push(result);

      if (result.status === 'ERROR' || result.status === 'MISMATCH') {
        errors.push(result);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Summary Table
  // ---------------------------------------------------------------------------

  logger.log(`\n${'='.repeat(70)}`);
  logger.log('SUMMARY');
  logger.log('='.repeat(70));

  // Per-database summary
  const dbSummaries: DbSummary[] = [];

  for (const dbName of targetDbs) {
    const targetDbName = dbName;
    const dbResults = allResults.filter((r) => r.db === targetDbName);
    const activeResults = dbResults.filter((r) => r.status !== 'SKIPPED');
    const totalDocs = dbResults.reduce((sum, r) => sum + r.targetDocs, 0);
    const hasError = dbResults.some((r) => r.status === 'ERROR');
    const hasMismatch = dbResults.some((r) => r.status === 'MISMATCH');

    let status: DbSummary['status'] = 'OK';
    if (hasError) {
      status = 'ERROR';
    } else if (hasMismatch) {
      status = 'MISMATCH';
    }

    dbSummaries.push({
      collections: activeResults.length,
      db: targetDbName,
      status,
      totalDocs,
    });
  }

  // Print table
  const colWidths = { collections: 12, db: 22, docs: 12, status: 10 };
  const header = [
    'Database'.padEnd(colWidths.db),
    'Collections'.padEnd(colWidths.collections),
    'Documents'.padEnd(colWidths.docs),
    'Status'.padEnd(colWidths.status),
  ].join(' | ');

  logger.log(header);
  logger.log('-'.repeat(header.length));

  for (const s of dbSummaries) {
    logger.log(
      [
        s.db.padEnd(colWidths.db),
        String(s.collections).padEnd(colWidths.collections),
        String(s.totalDocs).padEnd(colWidths.docs),
        s.status.padEnd(colWidths.status),
      ].join(' | '),
    );
  }

  const totalDocs = dbSummaries.reduce((sum, s) => sum + s.totalDocs, 0);
  const totalColsMigrated = dbSummaries.reduce(
    (sum, s) => sum + s.collections,
    0,
  );

  logger.log('-'.repeat(header.length));
  logger.log(
    [
      'TOTAL'.padEnd(colWidths.db),
      String(totalColsMigrated).padEnd(colWidths.collections),
      String(totalDocs).padEnd(colWidths.docs),
      (errors.length === 0 ? 'OK' : `${errors.length} ISSUES`).padEnd(
        colWidths.status,
      ),
    ].join(' | '),
  );

  // Print errors if any
  if (errors.length > 0) {
    logger.log(`\n${'='.repeat(70)}`);
    logger.log('ERRORS & MISMATCHES');
    logger.log('='.repeat(70));

    for (const e of errors) {
      logger.log(
        `  ${e.db}.${e.collection}: ${e.status}${e.error ? ` — ${e.error}` : ''}`,
      );
      if (e.status === 'MISMATCH') {
        logger.log(`    Source: ${e.sourceDocs}, Target: ${e.targetDocs}`);
      }
    }
  }

  // Cleanup
  await sourceClient.close();

  logger.log(`\nMigration ${DRY_RUN ? 'dry run' : ''} complete.`);

  if (!DRY_RUN) {
    logger.log('\nSource collections were NOT dropped.');
    logger.log('Verify the data, then drop source collections manually.');
  }

  // Exit with error code if there were issues
  if (errors.length > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  logger.error('Fatal error:', err);
  process.exit(1);
});
