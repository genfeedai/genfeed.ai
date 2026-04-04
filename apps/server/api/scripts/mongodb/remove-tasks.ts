/**
 * Remove the legacy automation tasks collection.
 *
 * Dry run by default. Pass `--live` to apply changes.
 */

import { runScript } from '@api-scripts/db/connection';
import { parseArgs } from '@api-scripts/db/seed-utils';
import { Logger } from '@nestjs/common';
import {
  type Db,
  type Document,
  type Filter,
  ObjectId,
  type OptionalId,
} from 'mongodb';

const logger = new Logger('RemoveTasks');

type LegacyTaskDocument = OptionalId<
  Document & {
    label?: string;
    recurringWorkflow?: {
      nextRunAt?: Date | string;
      schedule?: string;
      timezone?: string;
      workflow?: unknown;
    };
    workflow?: unknown;
    workflowId?: unknown;
  }
>;

type WorkflowDocument = OptionalId<
  Document & {
    recurrence?: {
      nextRunAt?: Date | string;
      schedule?: string;
      timezone?: string;
    };
  }
>;

type CronJobDocument = OptionalId<
  Document & {
    jobType?: string;
    payload?: Record<string, unknown>;
  }
>;

interface MigrationSummary {
  scannedTasks: number;
  linkedTasks: number;
  orphanTasks: number;
  workflowBackfills: number;
  cronJobsScanned: number;
  cronJobsMigrated: number;
  taskCollectionDropped: boolean;
}

function normalizeObjectId(value: unknown): ObjectId | null {
  if (value instanceof ObjectId) {
    return value;
  }

  if (typeof value === 'string' && ObjectId.isValid(value)) {
    return new ObjectId(value);
  }

  if (
    value &&
    typeof value === 'object' &&
    '_id' in value &&
    (value as { _id?: unknown })._id
  ) {
    return normalizeObjectId((value as { _id?: unknown })._id);
  }

  return null;
}

function normalizeDate(value: unknown): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  if (typeof value === 'string') {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  return null;
}

function resolveTaskWorkflowId(task: LegacyTaskDocument): ObjectId | null {
  return (
    normalizeObjectId(task.recurringWorkflow?.workflow) ??
    normalizeObjectId(task.workflowId) ??
    normalizeObjectId(task.workflow)
  );
}

function buildWorkflowBackfill(
  task: LegacyTaskDocument,
  workflow: WorkflowDocument,
): Record<string, unknown> | null {
  const recurring = task.recurringWorkflow;
  if (!recurring) {
    return null;
  }

  const update: Record<string, unknown> = {};

  if (!workflow.recurrence?.schedule && recurring.schedule) {
    update['recurrence.schedule'] = recurring.schedule;
  }

  if (!workflow.recurrence?.timezone && recurring.timezone) {
    update['recurrence.timezone'] = recurring.timezone;
  }

  if (!workflow.recurrence?.nextRunAt) {
    const nextRunAt = normalizeDate(recurring.nextRunAt);
    if (nextRunAt) {
      update['recurrence.nextRunAt'] = nextRunAt;
    }
  }

  return Object.keys(update).length > 0 ? update : null;
}

function extractTaskIdFromPayload(
  payload: Record<string, unknown>,
): ObjectId | null {
  const nestedTask = payload.task;

  return (
    normalizeObjectId(payload.taskId) ??
    normalizeObjectId(nestedTask) ??
    normalizeObjectId(
      nestedTask && typeof nestedTask === 'object'
        ? (nestedTask as { _id?: unknown })._id
        : null,
    )
  );
}

async function collectionExists(db: Db, name: string): Promise<boolean> {
  const collections = await db.listCollections({ name }).toArray();
  return collections.length > 0;
}

async function migrateTasks(
  db: Db,
  dryRun: boolean,
): Promise<MigrationSummary> {
  const summary: MigrationSummary = {
    cronJobsMigrated: 0,
    cronJobsScanned: 0,
    linkedTasks: 0,
    orphanTasks: 0,
    scannedTasks: 0,
    taskCollectionDropped: false,
    workflowBackfills: 0,
  };

  if (!(await collectionExists(db, 'tasks'))) {
    logger.log('No tasks collection found. Nothing to migrate.');
    return summary;
  }

  const tasksCollection = db.collection<LegacyTaskDocument>('tasks');
  const workflowsCollection = db.collection<WorkflowDocument>('workflows');
  const cronJobsCollection = db.collection<CronJobDocument>('cron-jobs');

  const tasks = await tasksCollection.find({}).toArray();
  summary.scannedTasks = tasks.length;
  logger.log(`Found ${tasks.length} task documents`);

  const taskWorkflowMap = new Map<string, ObjectId>();

  for (const task of tasks) {
    const workflowId = resolveTaskWorkflowId(task);

    if (!workflowId) {
      summary.orphanTasks += 1;
      logger.warn(
        `Orphan task ${task._id?.toString() ?? 'unknown'} (${task.label ?? 'unlabelled'}) has no workflow link`,
      );
      continue;
    }

    const workflow = await workflowsCollection.findOne({ _id: workflowId });
    if (!workflow) {
      summary.orphanTasks += 1;
      logger.warn(
        `Task ${task._id?.toString() ?? 'unknown'} points to missing workflow ${workflowId.toString()}`,
      );
      continue;
    }

    summary.linkedTasks += 1;
    if (task._id) {
      taskWorkflowMap.set(task._id.toString(), workflowId);
    }

    const workflowUpdate = buildWorkflowBackfill(task, workflow);
    if (!workflowUpdate) {
      continue;
    }

    summary.workflowBackfills += 1;

    if (dryRun) {
      logger.log(
        `[DRY RUN] Would backfill workflow ${workflowId.toString()} from task ${task._id?.toString() ?? 'unknown'}: ${Object.keys(workflowUpdate).join(', ')}`,
      );
      continue;
    }

    await workflowsCollection.updateOne(
      { _id: workflowId } as Filter<WorkflowDocument>,
      { $set: workflowUpdate },
    );
  }

  const cronJobs = await cronJobsCollection
    .find({ jobType: 'task_execution' } as Filter<CronJobDocument>)
    .toArray();
  summary.cronJobsScanned = cronJobs.length;
  logger.log(`Found ${cronJobs.length} cron jobs with task_execution`);

  for (const cronJob of cronJobs) {
    const payload = cronJob.payload ?? {};
    const taskId = extractTaskIdFromPayload(payload);

    if (!taskId) {
      logger.warn(
        `Cron job ${cronJob._id?.toString() ?? 'unknown'} has task_execution with no task id payload`,
      );
      continue;
    }

    const workflowId = taskWorkflowMap.get(taskId.toString());
    if (!workflowId) {
      logger.warn(
        `Cron job ${cronJob._id?.toString() ?? 'unknown'} references task ${taskId.toString()} with no workflow mapping`,
      );
      continue;
    }

    summary.cronJobsMigrated += 1;

    if (dryRun) {
      logger.log(
        `[DRY RUN] Would migrate cron job ${cronJob._id?.toString() ?? 'unknown'} to workflow_execution (${workflowId.toString()})`,
      );
      continue;
    }

    await cronJobsCollection.updateOne(
      { _id: cronJob._id } as Filter<CronJobDocument>,
      {
        $set: {
          jobType: 'workflow_execution',
          payload: {
            ...payload,
            workflowId,
          },
        },
        $unset: {
          'payload.task': '',
          'payload.taskId': '',
        },
      },
    );
  }

  if (dryRun) {
    logger.log('[DRY RUN] Would drop tasks collection');
    return summary;
  }

  await tasksCollection.drop();
  summary.taskCollectionDropped = true;
  logger.log('Dropped tasks collection');

  return summary;
}

async function main() {
  const args = parseArgs();

  const summary = await runScript(
    'Remove legacy tasks collection',
    (db) => migrateTasks(db, args.dryRun),
    {
      database: args.database,
      uri: args.uri,
    },
  );

  logger.log(`Tasks scanned: ${summary.scannedTasks}`);
  logger.log(`Linked tasks: ${summary.linkedTasks}`);
  logger.log(`Orphan tasks: ${summary.orphanTasks}`);
  logger.log(`Workflow backfills: ${summary.workflowBackfills}`);
  logger.log(`Cron jobs scanned: ${summary.cronJobsScanned}`);
  logger.log(`Cron jobs migrated: ${summary.cronJobsMigrated}`);
  logger.log(`Tasks collection dropped: ${summary.taskCollectionDropped}`);
}

main().catch((error: unknown) => {
  const message =
    error instanceof Error ? (error.stack ?? error.message) : String(error);
  logger.error(message);
  process.exitCode = 1;
});
