/**
 * Normalize brand slug data and label indexes.
 *
 * Dry-run by default. Pass `--live` to apply changes.
 *
 * Actions:
 * - backfill `slug` from legacy `handle` where `slug` is missing
 * - create a unique `slug_1` index if missing
 * - drop the stale unique `organization_1_label_1` index
 * - recreate `organization_1_label_1` as non-unique with the same partial filter
 * - drop the legacy unique `handle_1` index after slug backfill
 *
 * Usage:
 *   bun run apps/server/api/scripts/mongodb/normalize-brand-slug-and-label-indexes.ts
 *   bun run apps/server/api/scripts/mongodb/normalize-brand-slug-and-label-indexes.ts --live
 *   bun run apps/server/api/scripts/mongodb/normalize-brand-slug-and-label-indexes.ts --env=production
 *   bun run apps/server/api/scripts/mongodb/normalize-brand-slug-and-label-indexes.ts --env=production --live
 */

import { DB_CONNECTIONS } from '@api/constants/database.constants';
import { getClient, runScript } from '@api-scripts/db/connection';
import { parseArgs } from '@api-scripts/db/seed-utils';
import { type Document, type IndexDescription, ObjectId } from 'mongodb';

interface BrandDocument extends Document {
  _id: ObjectId;
  handle?: string;
  isDeleted?: boolean;
  label?: string;
  organization?: ObjectId;
  slug?: string;
}

const args = parseArgs();

const logger = {
  error: (...args: unknown[]) => console.error(...args),
  log: (...args: unknown[]) => console.log(...args),
};

function getPartialFilter(index: IndexDescription): Document | undefined {
  if (
    'partialFilterExpression' in index &&
    index.partialFilterExpression &&
    typeof index.partialFilterExpression === 'object'
  ) {
    return index.partialFilterExpression as Document;
  }

  return undefined;
}

runScript(
  'Normalize brand slug data and label indexes',
  async () => {
    const client = getClient();
    const cloud = client.db(DB_CONNECTIONS.CLOUD);
    const brands = cloud.collection<BrandDocument>('brands');

    const indexes = await brands.indexes();
    const slugIndex = indexes.find((index) => index.name === 'slug_1');
    const handleIndex = indexes.find((index) => index.name === 'handle_1');
    const orgLabelIndex = indexes.find(
      (index) => index.name === 'organization_1_label_1',
    );

    const docsMissingSlug = await brands
      .find(
        {
          handle: { $exists: true, $type: 'string' },
          slug: { $exists: false },
        },
        {
          projection: {
            _id: 1,
            handle: 1,
          },
        },
      )
      .toArray();

    const duplicateSlugCandidates = await brands
      .aggregate<{
        _id: string;
        count: number;
        ids: ObjectId[];
      }>([
        {
          $match: {
            $or: [
              { slug: { $exists: true, $type: 'string' } },
              { handle: { $exists: true, $type: 'string' } },
            ],
          },
        },
        {
          $project: {
            candidateSlug: {
              $ifNull: ['$slug', '$handle'],
            },
          },
        },
        {
          $group: {
            _id: '$candidateSlug',
            count: { $sum: 1 },
            ids: { $push: '$_id' },
          },
        },
        {
          $match: {
            _id: { $type: 'string' },
            count: { $gt: 1 },
          },
        },
      ])
      .toArray();

    if (duplicateSlugCandidates.length > 0) {
      throw new Error(
        `Slug backfill is blocked by duplicate candidates: ${duplicateSlugCandidates
          .map((entry) => `${entry._id} (${entry.count})`)
          .join(', ')}`,
      );
    }

    let slugBackfills = 0;

    for (const brand of docsMissingSlug) {
      if (!brand.handle) {
        continue;
      }

      slugBackfills++;

      if (args.dryRun) {
        logger.log(
          `[DRY RUN] Would set slug="${brand.handle}" on brand ${String(brand._id)}`,
        );
        continue;
      }

      await brands.updateOne(
        { _id: brand._id },
        {
          $set: {
            slug: brand.handle,
            updatedAt: new Date(),
          },
        },
      );

      logger.log(`🔄 Set slug="${brand.handle}" on brand ${String(brand._id)}`);
    }

    const targetOrgLabelPartialFilter =
      getPartialFilter(orgLabelIndex ?? {}) ??
      ({ isDeleted: false } as Document);

    let createdSlugIndex = false;
    if (!slugIndex) {
      if (args.dryRun) {
        logger.log('[DRY RUN] Would create unique index slug_1');
      } else {
        await brands.createIndex(
          { slug: 1 },
          {
            collation: { locale: 'en', strength: 1 },
            name: 'slug_1',
            unique: true,
          },
        );
        createdSlugIndex = true;
        logger.log('✅ Created unique index slug_1');
      }
    }

    let ensuredOrgLabelIndex = false;
    if (!orgLabelIndex || orgLabelIndex.unique) {
      if (args.dryRun) {
        logger.log(
          orgLabelIndex?.unique
            ? '[DRY RUN] Would drop unique index organization_1_label_1 and recreate it as non-unique'
            : '[DRY RUN] Would create non-unique index organization_1_label_1',
        );
      } else {
        if (orgLabelIndex?.unique) {
          await brands.dropIndex('organization_1_label_1');
        }
        await brands.createIndex(
          { organization: 1, label: 1 },
          {
            collation: { locale: 'en', strength: 1 },
            name: 'organization_1_label_1',
            partialFilterExpression: targetOrgLabelPartialFilter,
          },
        );
        ensuredOrgLabelIndex = true;
        logger.log(
          '✅ Ensured organization_1_label_1 is a non-unique partial index',
        );
      }
    }

    let droppedHandleIndex = false;
    if (handleIndex) {
      if (args.dryRun) {
        logger.log('[DRY RUN] Would drop legacy index handle_1');
      } else {
        await brands.dropIndex('handle_1');
        droppedHandleIndex = true;
        logger.log('✅ Dropped legacy index handle_1');
      }
    }

    const finalIndexes = args.dryRun ? indexes : await brands.indexes();

    logger.log('');
    logger.log('═'.repeat(80));
    logger.log(`BRAND INDEX ${args.dryRun ? 'DRY-RUN ' : ''}SUMMARY`);
    logger.log('═'.repeat(80));
    logger.log(`Brands missing slug backfilled: ${slugBackfills}`);
    logger.log(`Created slug_1 index: ${createdSlugIndex}`);
    logger.log(
      `Ensured organization_1_label_1 is non-unique: ${ensuredOrgLabelIndex}`,
    );
    logger.log(`Dropped handle_1 index: ${droppedHandleIndex}`);
    logger.log(
      `Indexes now: ${finalIndexes.map((index) => index.name).join(', ')}`,
    );

    return {
      createdSlugIndex,
      docsMissingSlug: docsMissingSlug.length,
      droppedHandleIndex,
      dryRun: args.dryRun,
      ensuredOrgLabelIndex,
      slugBackfills,
    };
  },
  {
    database: DB_CONNECTIONS.CLOUD,
    uri: args.uri,
  },
).catch((error) => {
  logger.error('brand index normalization failed', error);
  process.exit(1);
});
