/**
 * Migration: Rename issues collections to tasks
 *
 * Renames:
 *   issues          -> tasks
 *   issue-comments  -> task-comments
 *   issue-counters  -> task-counters
 *
 * Also renames fields:
 *   tasks.issueNumber -> tasks.taskNumber
 *   task-comments.issue -> task-comments.task
 *
 * Usage:
 *   bun run apps/server/api/scripts/mongodb/migrate-issues-to-tasks.ts          # dry-run
 *   bun run apps/server/api/scripts/mongodb/migrate-issues-to-tasks.ts --live   # apply
 */

import { runScript } from '@api-scripts/db/connection';
import { Logger } from '@nestjs/common';
import type { Db } from 'mongodb';

const logger = new Logger('MigrateIssuesToTasks');
const DRY_RUN = !process.argv.includes('--live');

const RENAMES: Array<{ from: string; to: string }> = [
  { from: 'issues', to: 'tasks' },
  { from: 'issue-comments', to: 'task-comments' },
  { from: 'issue-counters', to: 'task-counters' },
];

const collectionExists = async (db: Db, name: string): Promise<boolean> => {
  const collections = await db.listCollections({ name }).toArray();
  return collections.length > 0;
};

const countDocuments = async (db: Db, name: string): Promise<number> => {
  return db.collection(name).countDocuments();
};

const migrateCollections = async (db: Db): Promise<void> => {
  for (const { from, to } of RENAMES) {
    const sourceExists = await collectionExists(db, from);
    const targetExists = await collectionExists(db, to);

    if (!sourceExists && !targetExists) {
      logger.log(`Neither "${from}" nor "${to}" exist — skipping.`);
      continue;
    }

    if (!sourceExists && targetExists) {
      const count = await countDocuments(db, to);
      logger.log(
        `"${to}" already exists (${count} docs). Rename already applied.`,
      );
      continue;
    }

    if (sourceExists && targetExists) {
      const fromCount = await countDocuments(db, from);
      const toCount = await countDocuments(db, to);
      logger.warn(
        `Both "${from}" (${fromCount} docs) and "${to}" (${toCount} docs) exist. Manual merge required — skipping.`,
      );
      continue;
    }

    const sourceCount = await countDocuments(db, from);

    if (DRY_RUN) {
      logger.log(
        `[DRY RUN] Would rename "${from}" (${sourceCount} docs) -> "${to}"`,
      );
      continue;
    }

    await db.collection(from).rename(to);
    logger.log(`Renamed "${from}" (${sourceCount} docs) -> "${to}"`);
  }
};

const migrateFieldNames = async (db: Db): Promise<void> => {
  // Rename issueNumber -> taskNumber in tasks collection
  const tasksName = 'tasks';
  if (await collectionExists(db, tasksName)) {
    const count = await db
      .collection(tasksName)
      .countDocuments({ issueNumber: { $exists: true } });

    if (count > 0) {
      if (DRY_RUN) {
        logger.log(
          `[DRY RUN] Would rename "issueNumber" -> "taskNumber" on ${count} docs in "${tasksName}"`,
        );
      } else {
        await db
          .collection(tasksName)
          .updateMany(
            { issueNumber: { $exists: true } },
            { $rename: { issueNumber: 'taskNumber' } },
          );
        logger.log(
          `Renamed "issueNumber" -> "taskNumber" on ${count} docs in "${tasksName}"`,
        );
      }
    } else {
      logger.log(
        `No "issueNumber" field found in "${tasksName}" — already migrated.`,
      );
    }
  }

  // Rename issue -> task in task-comments collection
  const commentsName = 'task-comments';
  if (await collectionExists(db, commentsName)) {
    const count = await db
      .collection(commentsName)
      .countDocuments({ issue: { $exists: true } });

    if (count > 0) {
      if (DRY_RUN) {
        logger.log(
          `[DRY RUN] Would rename "issue" -> "task" on ${count} docs in "${commentsName}"`,
        );
      } else {
        await db
          .collection(commentsName)
          .updateMany(
            { issue: { $exists: true } },
            { $rename: { issue: 'task' } },
          );
        logger.log(
          `Renamed "issue" -> "task" on ${count} docs in "${commentsName}"`,
        );
      }
    } else {
      logger.log(
        `No "issue" field found in "${commentsName}" — already migrated.`,
      );
    }
  }
};

runScript(async (db: Db) => {
  if (DRY_RUN) {
    logger.log('=== DRY RUN (pass --live to apply changes) ===');
  } else {
    logger.log('=== LIVE RUN — applying changes to database ===');
  }

  await migrateCollections(db);
  await migrateFieldNames(db);

  logger.log('Migration complete.');
});
