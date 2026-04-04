import { runScript } from '@api-scripts/db/connection';
import { Logger } from '@nestjs/common';
import type { Db } from 'mongodb';

const logger = new Logger('RenameOutreachCampaignCollection');

const LEGACY_COLLECTIONS = [
  'campaigns',
  'outreach_campaigns',
  'outreachCampaigns',
] as const;
const TARGET_COLLECTION = 'outreach-campaigns';
const DRY_RUN = !process.argv.includes('--live');

const collectionExists = async (db: Db, name: string): Promise<boolean> => {
  const collections = await db.listCollections({ name }).toArray();
  return collections.length > 0;
};

const countDocuments = async (db: Db, name: string): Promise<number> => {
  return await db.collection(name).countDocuments();
};

const renameCollection = async (db: Db): Promise<void> => {
  const existingLegacyCollections = [];
  for (const collectionName of LEGACY_COLLECTIONS) {
    if (await collectionExists(db, collectionName)) {
      existingLegacyCollections.push(collectionName);
    }
  }

  const targetExists = await collectionExists(db, TARGET_COLLECTION);

  if (existingLegacyCollections.length === 0 && !targetExists) {
    logger.log(
      `None of ${JSON.stringify([...LEGACY_COLLECTIONS, TARGET_COLLECTION])} exist. Nothing to do.`,
    );
    return;
  }

  if (existingLegacyCollections.length === 0 && targetExists) {
    const targetCount = await countDocuments(db, TARGET_COLLECTION);
    logger.log(
      `"${TARGET_COLLECTION}" already exists with ${targetCount} document(s). Rename already applied.`,
    );
    return;
  }

  if (existingLegacyCollections.length === 1 && !targetExists) {
    const sourceCollection = existingLegacyCollections[0];
    const sourceCount = await countDocuments(db, sourceCollection);

    if (DRY_RUN) {
      logger.log(
        `[DRY RUN] Would rename "${sourceCollection}" (${sourceCount} document(s)) -> "${TARGET_COLLECTION}"`,
      );
      return;
    }

    await db.collection(sourceCollection).rename(TARGET_COLLECTION);
    logger.log(
      `Renamed "${sourceCollection}" (${sourceCount} document(s)) -> "${TARGET_COLLECTION}"`,
    );
    return;
  }

  if (existingLegacyCollections.length > 1) {
    throw new Error(
      `Multiple legacy collections exist (${existingLegacyCollections.join(', ')}). Manual reconciliation is required before renaming.`,
    );
  }

  const sourceCollection = existingLegacyCollections[0];
  const sourceCount = await countDocuments(db, sourceCollection);
  const targetCount = await countDocuments(db, TARGET_COLLECTION);

  logger.log(
    `Both collections exist. "${sourceCollection}" has ${sourceCount} document(s); "${TARGET_COLLECTION}" has ${targetCount} document(s).`,
  );

  if (sourceCount === 0) {
    if (DRY_RUN) {
      logger.log(
        `[DRY RUN] Would drop empty legacy collection "${sourceCollection}"`,
      );
      return;
    }

    await db.collection(sourceCollection).drop();
    logger.log(`Dropped empty legacy collection "${sourceCollection}"`);
    return;
  }

  if (targetCount === 0) {
    if (DRY_RUN) {
      logger.log(
        `[DRY RUN] Would drop empty "${TARGET_COLLECTION}" and rename "${sourceCollection}" -> "${TARGET_COLLECTION}"`,
      );
      return;
    }

    await db.collection(TARGET_COLLECTION).drop();
    await db.collection(sourceCollection).rename(TARGET_COLLECTION);
    logger.log(
      `Dropped empty "${TARGET_COLLECTION}" and renamed "${sourceCollection}" -> "${TARGET_COLLECTION}"`,
    );
    return;
  }

  throw new Error(
    `Both "${sourceCollection}" and "${TARGET_COLLECTION}" contain documents. Manual reconciliation is required before renaming.`,
  );
};

void runScript('rename-outreach-campaign-collection', renameCollection).catch(
  (error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown error';
    logger.error(message);
    process.exitCode = 1;
  },
);
