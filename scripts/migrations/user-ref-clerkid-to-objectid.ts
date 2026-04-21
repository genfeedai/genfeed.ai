/**
 * Reference Backfill: String refs -> Mongo ObjectId
 *
 * Enforces reference integrity across DBs by:
 * - replacing Clerk-style IDs (e.g. "user_...") in `user` / `userId`
 *   with `auth.users._id`
 * - converting stringified Mongo ObjectId hex values in selected ref fields
 *   back to BSON ObjectId values
 *
 * Usage:
 *   bun run scripts/migrations/user-ref-clerkid-to-objectid.ts                 # dry-run
 *   bun run scripts/migrations/user-ref-clerkid-to-objectid.ts --live          # write changes
 *   bun run scripts/migrations/user-ref-clerkid-to-objectid.ts --env=production
 *   bun run scripts/migrations/user-ref-clerkid-to-objectid.ts --env=production --live
 */

import { resolve } from 'node:path';
import { Logger } from '@nestjs/common';
import { config } from 'dotenv';
import {
  type Collection,
  type Db,
  MongoClient,
  ObjectId,
  type UpdateOneModel,
} from 'mongodb';

const logger = new Logger('UserRefClerkIdToObjectIdMigration');

const envArg = process.argv.find((a) => a.startsWith('--env='))?.split('=')[1];
const envSuffix = envArg || 'local';
config({
  path: resolve(__dirname, `../../apps/server/api/.env.${envSuffix}`),
});

const LEGACY_MONGODB_URI = process.env.LEGACY_MONGODB_URI;
if (!LEGACY_MONGODB_URI) {
  throw new Error(
    `LEGACY_MONGODB_URI is required for this legacy migration (loaded from .env.${envSuffix})`,
  );
}

const DRY_RUN = !process.argv.includes('--live');
const TARGET_DBS = [
  'agent',
  'analytics',
  'auth',
  'clips',
  'cloud',
  'crm',
  'fanvue',
  'marketplace',
] as const;
const TARGET_FIELDS = ['organization', 'user', 'userId', 'brand'] as const;

type TargetField = (typeof TARGET_FIELDS)[number];

interface MappingStats {
  db: string;
  collection: string;
  field: TargetField;
  scanned: number;
  updated: number;
  unresolved: number;
}

function isHexObjectId(value: string): boolean {
  return /^[a-f0-9]{24}$/i.test(value) && ObjectId.isValid(value);
}

async function main() {
  logger.log('='.repeat(70));
  logger.log('Reference Backfill: String refs -> Mongo ObjectId');
  logger.log('='.repeat(70));
  logger.log(`Environment: ${envSuffix}`);
  logger.log(`Mode: ${DRY_RUN ? 'DRY RUN' : 'LIVE'}`);
  logger.log('='.repeat(70));

  const client = new MongoClient(LEGACY_MONGODB_URI);
  await client.connect();
  logger.log('Connected to MongoDB');

  const clerkToMongoMap = await buildClerkToMongoMap(client.db('auth'));
  logger.log(`Loaded ${clerkToMongoMap.size} user mappings from auth.users`);

  const stats: MappingStats[] = [];

  for (const dbName of TARGET_DBS) {
    const db = client.db(dbName);
    const collections = await db
      .listCollections({}, { nameOnly: true })
      .toArray();

    for (const collectionInfo of collections) {
      const collectionName = collectionInfo.name;
      const collection = db.collection(collectionName);

      for (const field of TARGET_FIELDS) {
        const result = await processCollectionField(
          collection,
          dbName,
          collectionName,
          field,
          clerkToMongoMap,
        );
        if (result.scanned > 0) {
          stats.push(result);
        }
      }
    }
  }

  const totalScanned = stats.reduce((sum, s) => sum + s.scanned, 0);
  const totalUpdated = stats.reduce((sum, s) => sum + s.updated, 0);
  const totalUnresolved = stats.reduce((sum, s) => sum + s.unresolved, 0);

  logger.log(`\n${'='.repeat(70)}`);
  logger.log('SUMMARY');
  logger.log('='.repeat(70));
  logger.log(`Scanned references: ${totalScanned}`);
  logger.log(
    `${DRY_RUN ? 'Would update' : 'Updated'} references: ${totalUpdated}`,
  );
  logger.log(`Unresolved references: ${totalUnresolved}`);

  if (stats.length > 0) {
    logger.log('\nPer collection:');
    for (const item of stats) {
      logger.log(
        `- ${item.db}.${item.collection}.${item.field}: scanned=${item.scanned}, ${DRY_RUN ? 'wouldUpdate' : 'updated'}=${item.updated}, unresolved=${item.unresolved}`,
      );
    }
  }

  await client.close();
  logger.log('\nDone.');
}

async function buildClerkToMongoMap(db: Db): Promise<Map<string, ObjectId>> {
  const users = db.collection('users');
  const cursor = users.find(
    {
      _id: { $type: 'objectId' },
      clerkId: { $exists: true, $ne: null },
    },
    {
      projection: {
        _id: 1,
        clerkId: 1,
      },
    },
  );

  const map = new Map<string, ObjectId>();
  for await (const row of cursor) {
    const clerkId = row.clerkId;
    if (typeof clerkId === 'string' && clerkId.length > 0) {
      map.set(clerkId, row._id as ObjectId);
    }
  }

  return map;
}

function resolveObjectIdValue(
  field: TargetField,
  rawValue: string,
  clerkToMongoMap: Map<string, ObjectId>,
): ObjectId | null {
  if (field === 'user' || field === 'userId') {
    const mongoUserId = clerkToMongoMap.get(rawValue);
    if (mongoUserId) {
      return mongoUserId;
    }
  }

  if (isHexObjectId(rawValue)) {
    return new ObjectId(rawValue);
  }

  return null;
}

async function processCollectionField(
  collection: Collection,
  dbName: string,
  collectionName: string,
  field: TargetField,
  clerkToMongoMap: Map<string, ObjectId>,
): Promise<MappingStats> {
  const docs = await collection
    .find(
      {
        [field]: { $type: 'string' },
      },
      {
        projection: {
          _id: 1,
          [field]: 1,
        },
      },
    )
    .toArray();

  if (docs.length === 0) {
    return {
      collection: collectionName,
      db: dbName,
      field,
      scanned: 0,
      unresolved: 0,
      updated: 0,
    };
  }

  const bulkOps: UpdateOneModel[] = [];
  let unresolved = 0;

  for (const doc of docs) {
    const rawValue = doc[field];
    if (typeof rawValue !== 'string') {
      continue;
    }

    const resolvedObjectId = resolveObjectIdValue(
      field,
      rawValue,
      clerkToMongoMap,
    );
    if (!resolvedObjectId) {
      unresolved += 1;
      continue;
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $set: { [field]: resolvedObjectId } },
      },
    });
  }

  if (!DRY_RUN && bulkOps.length > 0) {
    await collection.bulkWrite(bulkOps, { ordered: false });
  }

  return {
    collection: collectionName,
    db: dbName,
    field,
    scanned: docs.length,
    unresolved,
    updated: bulkOps.length,
  };
}

main().catch((error: unknown) => {
  logger.error('Fatal migration failure', error);
  process.exit(1);
});
