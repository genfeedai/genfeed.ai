/**
 * Trend Preferences Brand-Scope Backfill
 *
 * Normalizes org-level trend preference records to use `brand: null` so the
 * active unique `(organization, brand)` index can safely enforce brand scope.
 *
 * Dry-run by default. Pass --live to write.
 *
 * This script does not invent brand-scoped records. It only:
 * - detects duplicate org-default records and fails loudly
 * - normalizes legacy org-default records with missing `brand` to `brand: null`
 *
 * Usage:
 *   bun run scripts/migrations/trend-preferences-brand-scope-backfill.ts
 *   bun run scripts/migrations/trend-preferences-brand-scope-backfill.ts --live
 *   bun run scripts/migrations/trend-preferences-brand-scope-backfill.ts --env=production
 *   bun run scripts/migrations/trend-preferences-brand-scope-backfill.ts --env=production --live
 */

import { Logger } from '@nestjs/common';
import type { Db, ObjectId } from 'mongodb';

import { runScript } from '../../apps/server/api/scripts/db/connection';
import { parseArgs } from '../../apps/server/api/scripts/db/seed-utils';

const logger = new Logger('TrendPreferencesBrandScopeBackfill');
const args = parseArgs();

const CANDIDATE_COLLECTIONS = [
  'trend-preferences',
  'trendpreferences',
] as const;

async function resolveCollectionName(db: Db): Promise<string> {
  const existingCollections = await db.listCollections().toArray();
  const matchingCollections = existingCollections
    .map((collection) => collection.name)
    .filter((name) =>
      CANDIDATE_COLLECTIONS.includes(
        name as (typeof CANDIDATE_COLLECTIONS)[number],
      ),
    );

  if (matchingCollections.length === 0) {
    throw new Error(
      `Could not find a trend preferences collection. Checked: ${CANDIDATE_COLLECTIONS.join(', ')}`,
    );
  }

  if (matchingCollections.length > 1) {
    throw new Error(
      `Found multiple candidate trend preference collections: ${matchingCollections.join(', ')}`,
    );
  }

  const collectionName = matchingCollections[0];
  if (!collectionName) {
    throw new Error(
      `Could not find a trend preferences collection. Checked: ${CANDIDATE_COLLECTIONS.join(', ')}`,
    );
  }

  return collectionName;
}

runScript(
  'Trend Preferences Brand Scope Backfill',
  async (db) => {
    const collectionName = await resolveCollectionName(db);
    const collection = db.collection(collectionName);

    const duplicateDefaults = await collection
      .aggregate<{
        _id: ObjectId;
        count: number;
        ids: ObjectId[];
      }>([
        {
          $match: {
            $or: [{ brand: { $exists: false } }, { brand: null }],
            isDeleted: false,
          },
        },
        {
          $group: {
            _id: '$organization',
            count: { $sum: 1 },
            ids: { $push: '$_id' },
          },
        },
        {
          $match: {
            count: { $gt: 1 },
          },
        },
      ])
      .toArray();

    if (duplicateDefaults.length > 0) {
      logger.error('Duplicate org-level default trend preferences detected.');
      for (const duplicate of duplicateDefaults) {
        logger.error(
          `organization=${duplicate._id.toString()} count=${duplicate.count} ids=${duplicate.ids.map((id) => id.toString()).join(',')}`,
        );
      }
      throw new Error(
        'Aborting backfill because duplicate org-level defaults must be deduplicated before enforcing brand scope.',
      );
    }

    const legacyOrgDefaultFilter = {
      brand: { $exists: false },
      isDeleted: false,
    };

    const legacyOrgDefaultCount = await collection.countDocuments(
      legacyOrgDefaultFilter,
    );

    logger.log(
      `📊 Collection "${collectionName}": ${legacyOrgDefaultCount} org-level preference records need normalization`,
    );

    if (legacyOrgDefaultCount === 0) {
      logger.log('✅ No legacy org-level trend preference records found.');
      return { normalized: 0, unchanged: true };
    }

    if (args.dryRun) {
      logger.log(
        `[DRY RUN] Would normalize ${legacyOrgDefaultCount} trend preference records from missing brand -> brand: null`,
      );
      return { dryRun: true, wouldNormalize: legacyOrgDefaultCount };
    }

    const result = await collection.updateMany(legacyOrgDefaultFilter, {
      $set: {
        brand: null,
        updatedAt: new Date(),
      },
    });

    logger.log(
      `🔄 Normalized ${result.modifiedCount} trend preference records`,
    );

    return {
      normalized: result.modifiedCount,
    };
  },
  { database: args.database, uri: args.uri },
).catch((error) => {
  logger.error('Migration failed:', error);
  process.exit(1);
});
