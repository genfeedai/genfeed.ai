/**
 * Normalize auth.organization-settings.enabledModels entries to ObjectId values.
 *
 * Dry-run by default. Pass `--live` to apply changes.
 *
 * Safety rules:
 * - convert only string values that are valid ObjectId hex
 * - convert only when the referenced cloud.models document exists
 * - preserve existing ObjectId values
 * - dedupe the final array by ObjectId hex string
 *
 * Usage:
 *   bun run apps/server/api/scripts/mongodb/normalize-enabled-models.ts
 *   bun run apps/server/api/scripts/mongodb/normalize-enabled-models.ts --env=production
 *   bun run apps/server/api/scripts/mongodb/normalize-enabled-models.ts --live
 *   bun run apps/server/api/scripts/mongodb/normalize-enabled-models.ts --env=production --live
 */

import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { getClient, runScript } from '@api-scripts/db/connection';
import { parseArgs } from '@api-scripts/db/seed-utils';
import { type Document, ObjectId } from 'mongodb';

const logger = {
  error: (...args: unknown[]) => console.error(...args),
  log: (...args: unknown[]) => console.log(...args),
};

interface OrganizationSettingsDocument extends Document {
  _id: ObjectId;
  enabledModels?: unknown[];
  organization?: ObjectId;
}

const args = parseArgs();

function isObjectIdLike(value: unknown): value is ObjectId {
  return value instanceof ObjectId;
}

runScript(
  'Normalize enabledModels',
  async () => {
    const client = getClient();
    const auth = client.db(DB_CONNECTIONS.AUTH);
    const cloud = client.db(DB_CONNECTIONS.CLOUD);

    const settings = auth.collection<OrganizationSettingsDocument>(
      'organization-settings',
    );
    const models = cloud.collection<{ _id: ObjectId }>('models');

    const docs = await settings
      .find({
        enabledModels: { $exists: true, $ne: [] },
        isDeleted: { $ne: true },
      })
      .project({
        _id: 1,
        enabledModels: 1,
        organization: 1,
      })
      .toArray();

    let docsScanned = 0;
    let docsToUpdate = 0;
    let convertedValues = 0;
    let invalidStringValues = 0;
    let missingModelValues = 0;

    for (const doc of docs) {
      docsScanned++;

      const normalizedValues: ObjectId[] = [];
      let changed = false;

      for (const rawValue of doc.enabledModels ?? []) {
        if (isObjectIdLike(rawValue)) {
          normalizedValues.push(rawValue);
          continue;
        }

        if (typeof rawValue !== 'string') {
          changed = true;
          invalidStringValues++;
          logger.log(
            `⚠️  Skipping unsupported enabledModels value on ${String(doc._id)}: ${JSON.stringify(rawValue)}`,
          );
          continue;
        }

        if (!ObjectId.isValid(rawValue)) {
          changed = true;
          invalidStringValues++;
          logger.log(
            `⚠️  Skipping invalid ObjectId string on ${String(doc._id)}: ${rawValue}`,
          );
          continue;
        }

        const objectId = new ObjectId(rawValue);
        const modelExists = await models.countDocuments({ _id: objectId });

        if (!modelExists) {
          changed = true;
          missingModelValues++;
          logger.log(
            `⚠️  Skipping missing model reference on ${String(doc._id)}: ${rawValue}`,
          );
          continue;
        }

        normalizedValues.push(objectId);
        changed = true;
        convertedValues++;
      }

      const dedupedValues = [
        ...new Map(
          normalizedValues.map((value) => [value.toHexString(), value]),
        ).values(),
      ];

      const currentHex = (doc.enabledModels ?? []).map((value) =>
        isObjectIdLike(value)
          ? value.toHexString()
          : typeof value === 'string'
            ? value
            : JSON.stringify(value),
      );
      const normalizedHex = dedupedValues.map((value) => value.toHexString());

      const arraysDiffer =
        currentHex.length !== normalizedHex.length ||
        currentHex.some((value, index) => value !== normalizedHex[index]);

      if (!changed && !arraysDiffer) {
        continue;
      }

      docsToUpdate++;

      if (args.dryRun) {
        logger.log(
          `[DRY RUN] Would normalize enabledModels for ${String(doc._id)} (${currentHex.length} -> ${normalizedHex.length})`,
        );
      } else {
        await settings.updateOne(
          { _id: doc._id, isDeleted: { $ne: true } },
          {
            $set: {
              enabledModels: dedupedValues,
              updatedAt: new Date(),
            },
          },
        );
        logger.log(
          `🔄 Normalized enabledModels for ${String(doc._id)} (${currentHex.length} -> ${normalizedHex.length})`,
        );
      }
    }

    logger.log('');
    logger.log('═'.repeat(80));
    logger.log(`ENABLED MODELS ${args.dryRun ? 'DRY-RUN ' : ''}SUMMARY`);
    logger.log('═'.repeat(80));
    logger.log(`Docs scanned: ${docsScanned}`);
    logger.log(
      `${args.dryRun ? '[DRY RUN] Would update docs' : 'Updated docs'}: ${docsToUpdate}`,
    );
    logger.log(`Converted string values: ${convertedValues}`);
    logger.log(`Invalid string values skipped: ${invalidStringValues}`);
    logger.log(`Missing model refs skipped: ${missingModelValues}`);

    return {
      convertedValues,
      docsScanned,
      docsToUpdate,
      dryRun: args.dryRun,
      invalidStringValues,
      missingModelValues,
    };
  },
  {
    database: DB_CONNECTIONS.AUTH,
    uri: args.uri,
  },
).catch((error) => {
  logger.error('enabledModels normalization failed', error);
  process.exit(1);
});
