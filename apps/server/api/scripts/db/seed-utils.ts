/**
 * Seed Utilities
 *
 * Common utilities for seed scripts including:
 * - Deep equality checking for field diffing
 * - Upsert logic with change tracking
 * - Summary reporting
 */

import type { Collection, Db, Document, Filter } from 'mongodb';

const logger = {
  error: (...args: unknown[]) => console.error(...args),
  log: (...args: unknown[]) => console.log(...args),
};

export interface SeedResult {
  inserted: number;
  updated: number;
  unchanged: number;
  errors: number;
  insertedKeys: string[];
  updatedKeys: string[];
}

export interface SeedOptions {
  dryRun?: boolean;
  keyField?: string;
  fieldsToCheck?: string[];
}

/**
 * Deep equality check for comparing field values
 */
export function deepEqual(a: unknown, b: unknown): boolean {
  if (a === b) {
    return true;
  }
  if (a == null || b == null) {
    return a === b;
  }
  if (typeof a !== typeof b) {
    return false;
  }

  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return false;
    }
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) {
        return false;
      }
    }
    return true;
  }

  if (typeof a === 'object' && typeof b === 'object') {
    const keysA = Object.keys(a as Record<string, unknown>);
    const keysB = Object.keys(b as Record<string, unknown>);
    if (keysA.length !== keysB.length) {
      return false;
    }
    for (const key of keysA) {
      if (
        !deepEqual(
          (a as Record<string, unknown>)[key],
          (b as Record<string, unknown>)[key],
        )
      ) {
        return false;
      }
    }
    return true;
  }

  return false;
}

/**
 * Upsert a document with field diffing
 * Only updates changed fields, preserves existing data
 */
export async function upsertDocument<T extends Document>(
  collection: Collection<T>,
  document: T,
  options: SeedOptions = {},
): Promise<'inserted' | 'updated' | 'unchanged' | 'error'> {
  const keyField = options.keyField || 'key';
  const dryRun = options.dryRun || false;
  const fieldsToCheck = options.fieldsToCheck || Object.keys(document);

  const key = document[keyField as keyof T] as string;
  const filter = { [keyField]: key } as Filter<T>;

  try {
    const existing = await collection.findOne(filter);

    if (existing) {
      // Build update object with only changed fields
      const update: Record<string, unknown> = {};

      for (const field of fieldsToCheck) {
        const newValue = document[field as keyof T];
        const existingValue = existing[field as keyof T];

        // Skip if field is undefined in new document
        if (newValue === undefined) {
          continue;
        }

        if (!deepEqual(existingValue, newValue)) {
          update[field] = newValue;
        }
      }

      // Fix isDeleted: null in existing records
      if (existing.isDeleted === null || existing.isDeleted === undefined) {
        update.isDeleted = false;
      }

      if (Object.keys(update).length === 0) {
        return 'unchanged';
      }

      update.updatedAt = new Date();

      if (dryRun) {
        logger.log(
          `[DRY RUN] WOULD UPDATE "${key}": ${Object.keys(update).join(', ')}`,
        );
      } else {
        await collection.updateOne(filter, { $set: update });
        logger.log(`🔄 Updated "${key}": ${Object.keys(update).join(', ')}`);
      }
      return 'updated';
    }

    // Insert new document
    const docToInsert = {
      ...document,
      createdAt: new Date(),
      isDeleted: document.isDeleted ?? false,
      updatedAt: new Date(),
    };

    if (dryRun) {
      logger.log(`[DRY RUN] WOULD INSERT "${key}"`);
    } else {
      await collection.insertOne(docToInsert as T);
      logger.log(`✅ Inserted "${key}"`);
    }
    return 'inserted';
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`❌ Error processing "${key}": ${message}`);
    return 'error';
  }
}

/**
 * Seed multiple documents with summary reporting
 */
export async function seedDocuments<T extends Document>(
  db: Db,
  collectionName: string,
  documents: T[],
  options: SeedOptions = {},
): Promise<SeedResult> {
  const collection = db.collection<T>(collectionName);
  const keyField = options.keyField || 'key';

  logger.log(
    `📝 Seeding ${documents.length} documents to "${collectionName}"...`,
  );
  if (options.dryRun) {
    logger.log(`*** DRY RUN MODE - No changes will be made ***`);
  }
  logger.log('');

  const result: SeedResult = {
    errors: 0,
    inserted: 0,
    insertedKeys: [],
    unchanged: 0,
    updated: 0,
    updatedKeys: [],
  };

  for (const doc of documents) {
    const key = doc[keyField as keyof T] as string;
    const status = await upsertDocument(collection, doc, options);

    switch (status) {
      case 'inserted':
        result.inserted++;
        result.insertedKeys.push(key);
        break;
      case 'updated':
        result.updated++;
        result.updatedKeys.push(key);
        break;
      case 'unchanged':
        result.unchanged++;
        break;
      case 'error':
        result.errors++;
        break;
    }
  }

  // Print summary
  logger.log('');
  logger.log('═'.repeat(50));
  logger.log('📊 SEED SUMMARY');
  logger.log('═'.repeat(50));
  logger.log(`✅ Inserted: ${result.inserted}`);
  logger.log(`🔄 Updated: ${result.updated}`);
  logger.log(`⏭️  Unchanged: ${result.unchanged}`);
  logger.log(`❌ Errors: ${result.errors}`);
  logger.log(`📦 Total in collection: ${await collection.countDocuments()}`);
  logger.log('═'.repeat(50));

  return result;
}

/**
 * Parse command line arguments
 */
export function parseArgs(): {
  dryRun: boolean;
  uri?: string;
  database?: string;
} {
  const args = process.argv.slice(2);
  return {
    database: args.find((a) => a.startsWith('--database='))?.split('=')[1],
    dryRun: !args.includes('--live'),
    uri: args.find((a) => a.startsWith('--uri='))?.split('=')[1],
  };
}
