/**
 * Agent Thread Status Backfill Migration
 *
 * Backfills missing `rooms.status` values in the agent database by setting
 * legacy thread documents to `AgentThreadStatus.ACTIVE`.
 *
 * Dry-run by default. Pass --live to write.
 * Safe to run multiple times — only updates threads missing the status field.
 *
 * Usage:
 *   bun run scripts/migrations/agent-thread-status-backfill.ts
 *   bun run scripts/migrations/agent-thread-status-backfill.ts --live
 *   bun run scripts/migrations/agent-thread-status-backfill.ts --env=staging
 *   bun run scripts/migrations/agent-thread-status-backfill.ts --env=staging --live
 *   bun run scripts/migrations/agent-thread-status-backfill.ts --env=production
 *   bun run scripts/migrations/agent-thread-status-backfill.ts --env=production --live
 */

import { AgentThreadStatus } from '@genfeedai/enums';
import { Logger } from '@nestjs/common';

import { runScript } from '../../apps/server/api/scripts/db/connection';
import { parseArgs } from '../../apps/server/api/scripts/db/seed-utils';

const logger = new Logger('AgentThreadStatusBackfill');

const DATABASE_NAME = 'agent';
const COLLECTION_NAME = 'rooms';

const args = parseArgs();

runScript(
  'Agent Thread Status Backfill',
  async (db) => {
    const collection = db.collection(COLLECTION_NAME);

    const baseFilter = { isDeleted: false };
    const missingStatusFilter = {
      ...baseFilter,
      status: { $exists: false },
    };

    const [activeCount, archivedCount, missingCount, totalCount] =
      await Promise.all([
        collection.countDocuments({
          ...baseFilter,
          status: AgentThreadStatus.ACTIVE,
        }),
        collection.countDocuments({
          ...baseFilter,
          status: AgentThreadStatus.ARCHIVED,
        }),
        collection.countDocuments(missingStatusFilter),
        collection.countDocuments(baseFilter),
      ]);

    logger.log(
      `📊 Threads: ${totalCount} total, ${activeCount} active, ${archivedCount} archived, ${missingCount} missing status`,
    );

    if (missingCount === 0) {
      logger.log(
        '✅ All non-deleted threads already have a status. Nothing to do.',
      );
      return {
        active: activeCount,
        archived: archivedCount,
        missing: 0,
        unchanged: totalCount,
        updated: 0,
      };
    }

    if (args.dryRun) {
      logger.log(
        `[DRY RUN] Would update ${missingCount} threads to status: "${AgentThreadStatus.ACTIVE}"`,
      );
      return {
        active: activeCount,
        archived: archivedCount,
        dryRun: true,
        missing: missingCount,
        wouldUpdate: missingCount,
      };
    }

    const result = await collection.updateMany(missingStatusFilter, {
      $set: {
        status: AgentThreadStatus.ACTIVE,
        updatedAt: new Date(),
      },
    });

    logger.log(
      `🔄 Updated ${result.modifiedCount} threads to status: "${AgentThreadStatus.ACTIVE}"`,
    );

    logger.log('');
    logger.log('═'.repeat(50));
    logger.log('📊 BACKFILL SUMMARY');
    logger.log('═'.repeat(50));
    logger.log(`🔄 Updated: ${result.modifiedCount}`);
    logger.log(`⏭️  Already set: ${totalCount - missingCount}`);
    logger.log(`🟢 Active before backfill: ${activeCount}`);
    logger.log(`📦 Total non-deleted threads: ${totalCount}`);
    logger.log('═'.repeat(50));

    return {
      activeBefore: activeCount,
      archivedBefore: archivedCount,
      missingBefore: missingCount,
      unchanged: totalCount - missingCount,
      updated: result.modifiedCount,
    };
  },
  { database: DATABASE_NAME, uri: args.uri },
).catch((error) => {
  logger.error('Backfill failed:', error);
  process.exit(1);
});
