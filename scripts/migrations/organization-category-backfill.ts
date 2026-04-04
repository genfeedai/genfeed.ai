/**
 * Organization Category Backfill Migration
 *
 * Backfills the `category` field on existing organizations that don't have it set.
 * Sets the default value to OrganizationCategory.BUSINESS.
 *
 * Dry-run by default. Pass --live to write.
 * Safe to run multiple times — only updates orgs missing the field.
 *
 * Usage:
 *   bun run scripts/migrations/organization-category-backfill.ts                # dry-run (default)
 *   bun run scripts/migrations/organization-category-backfill.ts --live         # actually write
 */

import { OrganizationCategory } from '@genfeedai/enums';
import { Logger } from '@nestjs/common';

import { runScript } from '../../apps/server/api/scripts/db/connection';
import { parseArgs } from '../../apps/server/api/scripts/db/seed-utils';

const logger = new Logger('OrgCategorySeed');

const COLLECTION_NAME = 'organizations';

const args = parseArgs();

runScript(
  'Organization Category Backfill',
  async (db) => {
    const collection = db.collection(COLLECTION_NAME);

    // Count orgs missing the category field
    const filter = {
      $or: [{ category: { $exists: false } }, { category: null }],
      isDeleted: false,
    };

    const missingCount = await collection.countDocuments(filter);
    const totalCount = await collection.countDocuments({ isDeleted: false });

    logger.log(
      `📊 Organizations: ${totalCount} total, ${missingCount} missing category`,
    );

    if (missingCount === 0) {
      logger.log(
        '✅ All organizations already have a category. Nothing to do.',
      );
      return { unchanged: totalCount, updated: 0 };
    }

    if (args.dryRun) {
      logger.log(
        `[DRY RUN] Would update ${missingCount} organizations with category: "${OrganizationCategory.BUSINESS}"`,
      );
      return { dryRun: true, wouldUpdate: missingCount };
    }

    const result = await collection.updateMany(filter, {
      $set: {
        category: OrganizationCategory.BUSINESS,
        updatedAt: new Date(),
      },
    });

    logger.log(
      `🔄 Updated ${result.modifiedCount} organizations with category: "${OrganizationCategory.BUSINESS}"`,
    );

    // Summary
    logger.log('');
    logger.log('═'.repeat(50));
    logger.log('📊 BACKFILL SUMMARY');
    logger.log('═'.repeat(50));
    logger.log(`🔄 Updated: ${result.modifiedCount}`);
    logger.log(`⏭️  Already set: ${totalCount - missingCount}`);
    logger.log(`📦 Total organizations: ${totalCount}`);
    logger.log('═'.repeat(50));

    return {
      unchanged: totalCount - missingCount,
      updated: result.modifiedCount,
    };
  },
  { database: args.database, uri: args.uri },
).catch((error) => {
  logger.error('Seed failed:', error);
  process.exit(1);
});
