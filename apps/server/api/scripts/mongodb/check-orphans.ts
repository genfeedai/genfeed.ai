/**
 * MongoDB Orphan Reference Checker
 *
 * Checks all relationships between collections and identifies:
 * 1. References to documents that don't exist
 * 2. References to documents that are deleted (isDeleted: true)
 * 3. Missing required fields
 *
 * Usage:
 *   bun run apps/server/api/scripts/mongodb/check-orphans.ts
 */

import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { getClient, runScript } from '@api-scripts/db/connection';
import { parseArgs } from '@api-scripts/db/seed-utils';
import type { Db } from 'mongodb';

const logger = {
  error: (...args: unknown[]) => console.error(...args),
  log: (...args: unknown[]) => console.log(...args),
};

interface Relationship {
  from: string;
  fromDatabase: string;
  field: string;
  missingRequiredExcludeFilter?: Record<string, unknown>;
  missingRequiredExcludeReason?: string;
  to: string;
  toDatabase: string;
  required: boolean;
  isArray?: boolean;
}

interface CheckResult {
  relationship: string;
  broken: number;
  notFound: number;
  deleted: number;
  missing: number;
  skipped: boolean;
  error?: string;
}

// Define all relationships in the database
const SEEDED_PUBLIC_VOICE_CATALOG_FILTER = {
  $or: [{ parent: { $exists: false } }, { parent: null }],
  category: 'voice',
  provider: { $exists: true, $nin: [null, ''] },
  scope: 'public',
  voiceSource: 'catalog',
};

const relationships: Relationship[] = [
  // Settings -> User
  {
    field: 'user',
    from: 'settings',
    fromDatabase: DB_CONNECTIONS.AUTH,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Organizations -> User
  {
    field: 'user',
    from: 'organizations',
    fromDatabase: DB_CONNECTIONS.AUTH,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Organization Settings -> Organization
  {
    field: 'organization',
    from: 'organization-settings',
    fromDatabase: DB_CONNECTIONS.AUTH,
    required: true,
    to: 'organizations',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Members -> Organization, User, Role
  {
    field: 'organization',
    from: 'members',
    fromDatabase: DB_CONNECTIONS.AUTH,
    required: true,
    to: 'organizations',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'user',
    from: 'members',
    fromDatabase: DB_CONNECTIONS.AUTH,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'role',
    from: 'members',
    fromDatabase: DB_CONNECTIONS.AUTH,
    required: true,
    to: 'roles',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'brands',
    from: 'members',
    fromDatabase: DB_CONNECTIONS.AUTH,
    isArray: true,
    required: false,
    to: 'brands',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Brands -> User, Organization
  {
    field: 'user',
    from: 'brands',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'organization',
    from: 'brands',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'organizations',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'voice',
    from: 'brands',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'ingredients',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'music',
    from: 'brands',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'ingredients',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Articles -> User, Organization, Brand, Asset, Tags
  {
    field: 'user',
    from: 'articles',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'organization',
    from: 'articles',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'organizations',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'brand',
    from: 'articles',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'brands',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'banner',
    from: 'articles',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'assets',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'tags',
    from: 'articles',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    isArray: true,
    required: false,
    to: 'tags',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Ingredients -> User, Organization, Brand, Folder, Parent
  {
    field: 'user',
    from: 'ingredients',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    missingRequiredExcludeFilter: SEEDED_PUBLIC_VOICE_CATALOG_FILTER,
    missingRequiredExcludeReason:
      'provider-backed public voice catalog records are intentionally ownerless',
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'organization',
    from: 'ingredients',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    missingRequiredExcludeFilter: SEEDED_PUBLIC_VOICE_CATALOG_FILTER,
    missingRequiredExcludeReason:
      'provider-backed public voice catalog records are intentionally ownerless',
    required: true,
    to: 'organizations',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'brand',
    from: 'ingredients',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    missingRequiredExcludeFilter: SEEDED_PUBLIC_VOICE_CATALOG_FILTER,
    missingRequiredExcludeReason:
      'provider-backed public voice catalog records are intentionally ownerless',
    required: true,
    to: 'brands',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'folder',
    from: 'ingredients',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'folders',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'parent',
    from: 'ingredients',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'ingredients',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'sources',
    from: 'ingredients',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    isArray: true,
    required: false,
    to: 'ingredients',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'metadata',
    from: 'ingredients',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'metadata',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'prompt',
    from: 'ingredients',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'prompts',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'training',
    from: 'ingredients',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'trainings',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'bookmark',
    from: 'ingredients',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'bookmarks',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Posts -> User, Organization, Brand, Credential
  {
    field: 'user',
    from: 'posts',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'organization',
    from: 'posts',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'organizations',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'brand',
    from: 'posts',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'brands',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'credential',
    from: 'posts',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'credentials',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'ingredients',
    from: 'posts',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    isArray: true,
    required: false,
    to: 'ingredients',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'parent',
    from: 'posts',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'posts',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'originalPost',
    from: 'posts',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'posts',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Evaluations -> Organization, User, Brand
  {
    field: 'organization',
    from: 'evaluations',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'organizations',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'user',
    from: 'evaluations',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'brand',
    from: 'evaluations',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'brands',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Knowledge Bases -> Organization, Brand, User
  {
    field: 'organization',
    from: 'knowledge-bases',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'organizations',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'brand',
    from: 'knowledge-bases',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'brands',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'user',
    from: 'knowledge-bases',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Bots -> Organization, Brand, User
  {
    field: 'organization',
    from: 'bots',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'organizations',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'brand',
    from: 'bots',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'brands',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'user',
    from: 'bots',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Subscriptions -> Customer
  {
    field: 'customer',
    from: 'subscriptions',
    fromDatabase: DB_CONNECTIONS.AUTH,
    required: true,
    to: 'customers',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Subscription Attributions -> User
  {
    field: 'user',
    from: 'subscription-attributions',
    fromDatabase: DB_CONNECTIONS.AUTH,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Profiles -> User
  {
    field: 'user',
    from: 'profiles',
    fromDatabase: DB_CONNECTIONS.AUTH,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Templates -> Creator, Organization
  {
    field: 'createdBy',
    from: 'templates',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'organization',
    from: 'templates',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'organizations',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Template Usage -> User
  {
    field: 'user',
    from: 'template-usages',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Context Bases -> User, Brand
  {
    field: 'user',
    from: 'context-bases',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'brand',
    from: 'context-bases',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'brands',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Context Entries -> Context Base
  {
    field: 'contextBase',
    from: 'context-entries',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'context-bases',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Schedules -> User, Brand
  {
    field: 'user',
    from: 'schedules',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'brand',
    from: 'schedules',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'brands',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Repurposing Jobs -> User
  {
    field: 'user',
    from: 'repurposing-jobs',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Trends -> Organization, Brand
  {
    field: 'organization',
    from: 'trends',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'organizations',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'brand',
    from: 'trends',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'brands',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Organization Settings -> Models
  {
    field: 'enabledModels',
    from: 'organization-settings',
    fromDatabase: DB_CONNECTIONS.AUTH,
    isArray: true,
    required: false,
    to: 'models',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Optimizations -> User, ContentScore
  {
    field: 'user',
    from: 'optimizations',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },
  {
    field: 'contentScore',
    from: 'optimizations',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'content-scores',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },

  // Content Scores -> User
  {
    field: 'user',
    from: 'content-scores',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Forecasts -> User
  {
    field: 'user',
    from: 'forecasts',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: true,
    to: 'users',
    toDatabase: DB_CONNECTIONS.AUTH,
  },

  // Tracked Links -> Ingredient, Brand
  {
    field: 'ingredient',
    from: 'tracked-links',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'ingredients',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
  {
    field: 'brand',
    from: 'tracked-links',
    fromDatabase: DB_CONNECTIONS.CLOUD,
    required: false,
    to: 'brands',
    toDatabase: DB_CONNECTIONS.CLOUD,
  },
];

async function collectionExists(
  db: Db,
  collectionName: string,
): Promise<boolean> {
  const collections = await db
    .listCollections({ name: collectionName })
    .toArray();
  return collections.length > 0;
}

function chunkValues<T>(values: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < values.length; i += size) {
    chunks.push(values.slice(i, i + size));
  }
  return chunks;
}

function getReferenceKey(value: unknown): string {
  if (value === null || value === undefined) {
    return String(value);
  }
  if (typeof value === 'object' && value && 'toString' in value) {
    return String(value);
  }
  return JSON.stringify(value);
}

function getDatabase(db: Db, databaseName: string): Db {
  if (db.databaseName === databaseName) {
    return db;
  }
  return getClient().db(databaseName);
}

function buildMissingRequiredFilter(
  rel: Relationship,
): Record<string, unknown> {
  const filter: Record<string, unknown> = {
    $or: [{ [rel.field]: { $exists: false } }, { [rel.field]: null }],
    isDeleted: { $ne: true },
  };

  if (rel.missingRequiredExcludeFilter) {
    filter.$nor = [rel.missingRequiredExcludeFilter];
  }

  return filter;
}

async function checkCrossDatabaseReferences(
  sourceDb: Db,
  targetDb: Db,
  rel: Relationship,
): Promise<Pick<CheckResult, 'deleted' | 'missing' | 'notFound'>> {
  const { field, from, isArray, required, to } = rel;
  const sourceCollection = sourceDb.collection(from);
  const targetCollection = targetDb.collection(to);

  let missingCount = 0;
  const references: unknown[] = [];
  const uniqueReferences = new Map<string, unknown>();

  if (isArray) {
    const docs = await sourceCollection
      .find(
        {
          [field]: {
            $exists: true,
            $ne: null,
            $not: { $size: 0 },
            $type: 'array',
          },
          isDeleted: { $ne: true },
        },
        { projection: { [field]: 1 } },
      )
      .toArray();

    for (const doc of docs) {
      const values = doc[field];
      if (!Array.isArray(values)) {
        continue;
      }
      for (const value of values) {
        if (value === null || value === undefined) {
          continue;
        }
        references.push(value);
        uniqueReferences.set(getReferenceKey(value), value);
      }
    }
  } else {
    const docs = await sourceCollection
      .find(
        {
          [field]: { $exists: true, $ne: null },
          isDeleted: { $ne: true },
        },
        { projection: { [field]: 1 } },
      )
      .toArray();

    for (const doc of docs) {
      const value = doc[field];
      if (value === null || value === undefined) {
        continue;
      }
      references.push(value);
      uniqueReferences.set(getReferenceKey(value), value);
    }

    if (required) {
      missingCount = await sourceCollection.countDocuments(
        buildMissingRequiredFilter(rel),
      );
    }
  }

  const targetState = new Map<string, { isDeleted: boolean }>();

  for (const chunk of chunkValues([...uniqueReferences.values()], 500)) {
    const docs = await targetCollection
      .find({ _id: { $in: chunk } }, { projection: { _id: 1, isDeleted: 1 } })
      .toArray();

    for (const doc of docs) {
      targetState.set(getReferenceKey(doc._id), {
        isDeleted: doc.isDeleted === true,
      });
    }
  }

  let deletedCount = 0;
  let notFoundCount = 0;

  for (const reference of references) {
    const state = targetState.get(getReferenceKey(reference));
    if (!state) {
      notFoundCount++;
      continue;
    }
    if (state.isDeleted) {
      deletedCount++;
    }
  }

  return {
    deleted: deletedCount,
    missing: missingCount,
    notFound: notFoundCount,
  };
}

async function checkRelationship(
  db: Db,
  rel: Relationship,
): Promise<CheckResult> {
  const { field, from, fromDatabase, isArray, required, to, toDatabase } = rel;
  const relationshipStr = `${fromDatabase}.${from}.${field} -> ${toDatabase}.${to}${isArray ? ' (array)' : ''}${required ? ' (required)' : ' (optional)'}`;
  const sourceDb = getDatabase(db, fromDatabase);
  const targetDb = getDatabase(db, toDatabase);

  logger.log(`\nChecking: ${relationshipStr}`);
  if (required && rel.missingRequiredExcludeReason) {
    logger.log(
      `  ℹ️  Missing-field audit excludes docs where ${rel.missingRequiredExcludeReason}`,
    );
  }

  if (!(await collectionExists(sourceDb, from))) {
    logger.log(`  ⚠️  Collection '${from}' does not exist`);
    return {
      broken: 0,
      deleted: 0,
      missing: 0,
      notFound: 0,
      relationship: relationshipStr,
      skipped: true,
    };
  }

  if (!(await collectionExists(targetDb, to))) {
    logger.log(`  ⚠️  Target collection '${to}' does not exist`);
    return {
      broken: 0,
      deleted: 0,
      missing: 0,
      notFound: 0,
      relationship: relationshipStr,
      skipped: true,
    };
  }

  try {
    let notFoundCount = 0;
    let deletedCount = 0;
    let missingCount = 0;

    if (fromDatabase !== toDatabase) {
      const result = await checkCrossDatabaseReferences(
        sourceDb,
        targetDb,
        rel,
      );
      notFoundCount = result.notFound;
      deletedCount = result.deleted;
      missingCount = result.missing;
    } else if (isArray) {
      // Handle array references using aggregation
      const sourceCollection = sourceDb.collection(from);
      const pipeline = [
        {
          $match: {
            [field]: {
              $exists: true,
              $ne: null,
              $not: { $size: 0 },
              $type: 'array',
            },
            isDeleted: { $ne: true },
          },
        },
        { $unwind: { path: `$${field}`, preserveNullAndEmptyArrays: false } },
        {
          $lookup: {
            as: 'refDoc',
            foreignField: '_id',
            from: to,
            localField: field,
          },
        },
        {
          $match: {
            $or: [{ refDoc: { $size: 0 } }, { 'refDoc.isDeleted': true }],
          },
        },
        {
          $project: {
            _id: 1,
            refDoc: { $arrayElemAt: ['$refDoc', 0] },
            referenceId: `$${field}`,
          },
        },
      ];

      const results = await sourceCollection.aggregate(pipeline).toArray();

      for (const result of results) {
        if (!result.refDoc) {
          notFoundCount++;
        } else if (result.refDoc.isDeleted === true) {
          deletedCount++;
        }
      }
    } else {
      // Handle single references
      const sourceCollection = sourceDb.collection(from);
      const pipeline = [
        {
          $match: {
            [field]: { $exists: true, $ne: null },
            isDeleted: { $ne: true },
          },
        },
        {
          $lookup: {
            as: 'refDoc',
            foreignField: '_id',
            from: to,
            localField: field,
          },
        },
        {
          $match: {
            $or: [{ refDoc: { $size: 0 } }, { 'refDoc.isDeleted': true }],
          },
        },
        {
          $project: {
            _id: 1,
            refDoc: { $arrayElemAt: ['$refDoc', 0] },
            referenceId: `$${field}`,
          },
        },
      ];

      const results = await sourceCollection.aggregate(pipeline).toArray();

      for (const result of results) {
        if (!result.refDoc) {
          notFoundCount++;
        } else if (result.refDoc.isDeleted === true) {
          deletedCount++;
        }
      }

      // Check for missing required fields
      if (required) {
        const missingDocs = await sourceCollection.countDocuments(
          buildMissingRequiredFilter(rel),
        );
        missingCount = missingDocs;
      }
    }

    const totalBroken = notFoundCount + deletedCount + missingCount;

    if (totalBroken === 0) {
      logger.log('  ✅ All references are valid');
    } else {
      logger.log(`  ❌ Found ${totalBroken} broken reference(s):`);
      if (notFoundCount > 0) {
        logger.log(
          `     - ${notFoundCount} pointing to non-existent documents`,
        );
      }
      if (deletedCount > 0) {
        logger.log(`     - ${deletedCount} pointing to deleted documents`);
      }
      if (missingCount > 0) {
        logger.log(`     - ${missingCount} with missing required fields`);
      }
    }

    return {
      broken: totalBroken,
      deleted: deletedCount,
      missing: missingCount,
      notFound: notFoundCount,
      relationship: relationshipStr,
      skipped: false,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.log(`  ❌ Error checking relationship: ${message}`);
    return {
      broken: 0,
      deleted: 0,
      error: message,
      missing: 0,
      notFound: 0,
      relationship: relationshipStr,
      skipped: true,
    };
  }
}

async function checkAllOrphans(db: Db): Promise<void> {
  logger.log('═'.repeat(80));
  logger.log('MongoDB Orphan Reference Checker');
  logger.log('═'.repeat(80));
  logger.log(`Checking ${relationships.length} relationships...\n`);

  const results: CheckResult[] = [];
  let totalBroken = 0;
  let totalNotFound = 0;
  let totalDeleted = 0;
  let totalMissing = 0;

  for (const rel of relationships) {
    const result = await checkRelationship(db, rel);
    results.push(result);

    if (!result.skipped) {
      totalBroken += result.broken;
      totalNotFound += result.notFound;
      totalDeleted += result.deleted;
      totalMissing += result.missing;
    }
  }

  logger.log(`\n${'═'.repeat(80)}`);
  logger.log('SUMMARY');
  logger.log('═'.repeat(80));
  logger.log(`Total relationships checked: ${relationships.length}`);
  logger.log(`Total broken references: ${totalBroken}`);
  logger.log(`  - References to non-existent documents: ${totalNotFound}`);
  logger.log(`  - References to deleted documents: ${totalDeleted}`);
  logger.log(`  - Missing required fields: ${totalMissing}`);

  if (totalBroken > 0) {
    logger.log('\n⚠️  Broken references found. Review the details above.');
  } else {
    logger.log('\n✅ No broken references found! All relationships are valid.');
  }

  logger.log('═'.repeat(80));
}

// Run the check
const args = parseArgs();

runScript('Orphan Reference Check', checkAllOrphans, {
  database: args.database,
  uri: args.uri,
}).catch((error) => {
  logger.error('Check failed:', error);
  process.exit(1);
});
