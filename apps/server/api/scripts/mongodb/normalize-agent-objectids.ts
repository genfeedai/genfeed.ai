/**
 * Normalize legacy string ObjectId fields in the agent database.
 *
 * Dry run by default. Pass `--live` to apply changes.
 */

import { runScript } from '@api-scripts/db/connection';
import { parseArgs } from '@api-scripts/db/seed-utils';
import type { Db } from 'mongodb';

const logger = {
  log: (...args: unknown[]) => console.log(...args),
};

interface FieldMigration {
  collection: string;
  field: 'organization' | 'user';
}

interface MigrationSummary {
  matched: number;
  modified: number;
  skipped: number;
}

const FIELD_MIGRATIONS: FieldMigration[] = [
  { collection: 'agent-campaigns', field: 'organization' },
  { collection: 'agent-campaigns', field: 'user' },
  { collection: 'agent-goals', field: 'organization' },
  { collection: 'agent-goals', field: 'user' },
  { collection: 'agent-memories', field: 'organization' },
  { collection: 'agent-memories', field: 'user' },
  { collection: 'agent-messages', field: 'organization' },
  { collection: 'agent-messages', field: 'user' },
  { collection: 'agent-profile-snapshots', field: 'organization' },
  { collection: 'agent-runs', field: 'organization' },
  { collection: 'agent-runs', field: 'user' },
  { collection: 'agent-session-bindings', field: 'organization' },
  { collection: 'agent-strategies', field: 'organization' },
  { collection: 'agent-strategies', field: 'user' },
  { collection: 'agent-strategy-opportunities', field: 'organization' },
  { collection: 'agent-strategy-reports', field: 'organization' },
  { collection: 'agent-thread-events', field: 'organization' },
  { collection: 'agent-thread-snapshots', field: 'organization' },
  { collection: 'agent-threads', field: 'organization' },
  { collection: 'agent-threads', field: 'user' },
  { collection: 'agent-input-requests', field: 'organization' },
];

const OBJECT_ID_HEX = /^[a-f\d]{24}$/i;

async function normalizeField(
  db: Db,
  migration: FieldMigration,
  dryRun: boolean,
): Promise<MigrationSummary> {
  const collection = db.collection(migration.collection);
  const filter = {
    [migration.field]: {
      $regex: OBJECT_ID_HEX,
      $type: 'string',
    },
  };

  const matched = await collection.countDocuments(filter);

  if (matched === 0) {
    logger.log(
      `Skipping ${migration.collection}.${migration.field} - no string ids found`,
    );
    return { matched: 0, modified: 0, skipped: 1 };
  }

  if (dryRun) {
    logger.log(
      `[DRY RUN] Would normalize ${matched} documents in ${migration.collection}.${migration.field}`,
    );
    return { matched, modified: 0, skipped: 0 };
  }

  const result = await collection.updateMany(filter, [
    {
      $set: {
        [migration.field]: {
          $toObjectId: `$${migration.field}`,
        },
      },
    },
  ]);

  logger.log(
    `Normalized ${migration.collection}.${migration.field}: matched=${result.matchedCount} modified=${result.modifiedCount}`,
  );

  return {
    matched: result.matchedCount,
    modified: result.modifiedCount,
    skipped: 0,
  };
}

async function main(): Promise<void> {
  const args = parseArgs();

  await runScript(
    'Normalize Agent ObjectIds',
    async (db) => {
      let matched = 0;
      let modified = 0;
      let skipped = 0;

      for (const migration of FIELD_MIGRATIONS) {
        const result = await normalizeField(db, migration, args.dryRun);
        matched += result.matched;
        modified += result.modified;
        skipped += result.skipped;
      }

      logger.log('\n' + '═'.repeat(60));
      logger.log('Normalization summary');
      logger.log('═'.repeat(60));
      logger.log(`Matched: ${matched}`);
      logger.log(`Modified: ${modified}`);
      logger.log(`Skipped: ${skipped}`);

      if (args.dryRun) {
        logger.log('\nDRY RUN ONLY - no changes applied');
      }
    },
    {
      database: args.database || 'agent',
      uri: args.uri,
    },
  );
}

void main();
