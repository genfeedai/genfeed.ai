/**
 * One-off migration: move workspace-tasks documents into the tasks collection.
 *
 * Dry run (preview only, no writes):
 *   bun run scripts/migrate-workspace-tasks-to-tasks.ts --dry-run
 *
 * Apply:
 *   MONGODB_URI=<uri> bun run scripts/migrate-workspace-tasks-to-tasks.ts
 *
 * Env:
 *   MONGODB_URI — MongoDB connection string (cloud DB). Defaults to localhost.
 *
 * Safety:
 *   - Dry-run mode is triggered with --dry-run flag (no writes performed)
 *   - Idempotent: skips tasks that already have a migratedFromWorkspaceTaskId
 *   - Does NOT delete workspace-tasks — run cleanup manually after verifying
 *
 * Status mapping:
 *   triaged       → backlog
 *   in_progress   → in_progress
 *   needs_review  → in_review
 *   completed     → done
 *   failed        → failed
 *   dismissed     → cancelled
 *
 * Priority mapping:
 *   normal → medium  (WorkspaceTask scale: high/normal/low → Task scale: critical/high/medium/low)
 *   high   → high
 *   low    → low
 *
 * Field notes:
 *   - identifier / taskNumber: set to "WT-<sourceId>" / 0 for migrated docs.
 *     These are legacy records; the live TaskCountersService assigns real values
 *     on new task creation. The identifier is unique per migrated doc.
 *   - eventStream.timestamp → eventStream.createdAt (field rename)
 *   - eventStream.id field dropped (not present in Task schema)
 *   - planningThreadId: WorkspaceTask stores as string; Task expects ObjectId.
 *     Valid ObjectId strings are converted; invalid ones are dropped.
 *   - user (ObjectId ref) → assigneeUserId (string)
 */
import mongoose from 'mongoose';

const MONGODB_URI =
  process.env.MONGODB_URI || 'mongodb://localhost:27017/genfeed';
const DRY_RUN = process.argv.includes('--dry-run');

const STATUS_MAP: Record<string, string> = {
  completed: 'done',
  dismissed: 'cancelled',
  failed: 'failed',
  in_progress: 'in_progress',
  needs_review: 'in_review',
  triaged: 'backlog',
};

const PRIORITY_MAP: Record<string, string> = {
  high: 'high',
  low: 'low',
  normal: 'medium',
};

function mapStatus(status: string): string {
  return STATUS_MAP[status] ?? 'backlog';
}

function mapPriority(priority: string): string {
  return PRIORITY_MAP[priority] ?? 'medium';
}

function toObjectIdOrUndefined(
  value: unknown,
): mongoose.Types.ObjectId | undefined {
  if (!value) return undefined;
  const str = String(value);
  if (mongoose.Types.ObjectId.isValid(str)) {
    return new mongoose.Types.ObjectId(str);
  }
  return undefined;
}

function mapEventStream(
  events: Array<Record<string, unknown>>,
): Array<Record<string, unknown>> {
  return events.map((e) => ({
    createdAt: e.timestamp ?? new Date(),
    payload: e.payload,
    type: e.type,
    userId: undefined,
  }));
}

async function migrate(): Promise<void> {
  if (DRY_RUN) {
    console.log('=== DRY RUN — no writes will be made ===\n');
  }

  await mongoose.connect(MONGODB_URI);
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('MongoDB connection database is not available.');
  }

  const workspaceTasksColl = db.collection('workspace-tasks');
  const tasksColl = db.collection('tasks');

  const total = await workspaceTasksColl.countDocuments({ isDeleted: false });
  console.log(`Found ${total} non-deleted workspace-tasks to process\n`);

  const cursor = workspaceTasksColl.find({ isDeleted: false });
  let migrated = 0;
  let skipped = 0;
  let errors = 0;

  for await (const doc of cursor as AsyncIterable<Record<string, unknown>>) {
    const sourceId = String(doc._id);

    // Idempotency: skip if this workspace-task was already migrated
    const existing = await tasksColl.findOne({
      migratedFromWorkspaceTaskId: doc._id,
    });

    if (existing) {
      console.log(
        `[SKIP] ${sourceId} — already migrated as task ${String(existing._id)}`,
      );
      skipped++;
      continue;
    }

    const taskDoc: Record<string, unknown> = {
      // Organization + brand scoping
      organization: doc.organization,
      brand: doc.brand,

      // Identifier: use a deterministic placeholder so these are unique
      // Real identifiers are assigned by TaskCountersService on live task creation
      identifier: `WT-${sourceId}`,
      taskNumber: 0,

      // Core content
      title: doc.title,
      description: undefined,
      request: doc.request,
      outputType: doc.outputType,
      platforms: Array.isArray(doc.platforms) ? doc.platforms : [],

      // Status + priority mapping
      status: mapStatus(String(doc.status ?? 'triaged')),
      priority: mapPriority(String(doc.priority ?? 'normal')),

      // Review lifecycle
      reviewState: doc.reviewState ?? 'none',
      reviewTriggered: doc.reviewTriggered ?? false,
      resultPreview: doc.resultPreview,
      failureReason: doc.failureReason,
      requestedChangesReason: doc.requestedChangesReason,

      // Assignee: WorkspaceTask.user (ObjectId ref) → assigneeUserId (string)
      assigneeUserId: doc.user ? String(doc.user) : undefined,
      assigneeAgentId: undefined,

      // Checkout fields (not present in WorkspaceTask)
      checkoutRunId: undefined,
      checkoutAgentId: undefined,
      checkedOutAt: undefined,

      // PM fields (not present in WorkspaceTask)
      parentId: undefined,
      projectId: undefined,
      goalId: undefined,
      linkedEntities: [],

      // Routing / execution
      executionPathUsed: doc.executionPathUsed,
      chosenModel: doc.chosenModel,
      chosenProvider: doc.chosenProvider,
      routingSummary: doc.routingSummary,
      skillsUsed: Array.isArray(doc.skillsUsed) ? doc.skillsUsed : [],
      skillVariantIds: Array.isArray(doc.skillVariantIds)
        ? doc.skillVariantIds
        : [],

      // Decomposition
      decomposition: doc.decomposition,

      // Quality assessment
      qualityAssessment: doc.qualityAssessment,

      // Execution progress
      progress: doc.progress ?? {
        activeRunCount: 0,
        message: '',
        percent: 0,
        stage: 'queued',
      },

      // Event stream: rename timestamp→createdAt, drop id field
      eventStream: Array.isArray(doc.eventStream)
        ? mapEventStream(doc.eventStream as Array<Record<string, unknown>>)
        : [],

      // Linked AI records
      linkedIssueId: doc.linkedIssueId,
      linkedRunIds: Array.isArray(doc.linkedRunIds) ? doc.linkedRunIds : [],
      linkedOutputIds: Array.isArray(doc.linkedOutputIds)
        ? doc.linkedOutputIds
        : [],
      approvedOutputIds: Array.isArray(doc.approvedOutputIds)
        ? doc.approvedOutputIds
        : [],
      linkedApprovalIds: Array.isArray(doc.linkedApprovalIds)
        ? doc.linkedApprovalIds
        : [],

      // planningThreadId: WorkspaceTask stores as string; Task expects ObjectId
      planningThreadId: toObjectIdOrUndefined(doc.planningThreadId),

      // Lifecycle timestamps
      completedAt: doc.completedAt,
      dismissedAt: doc.dismissedAt,

      // Migration tracking (idempotency key)
      migratedFromWorkspaceTaskId: doc._id,

      // Soft delete
      isDeleted: false,

      // Timestamps (preserve originals)
      createdAt: doc.createdAt ?? new Date(),
      updatedAt: doc.updatedAt ?? new Date(),
    };

    if (DRY_RUN) {
      console.log(
        `[DRY] Would migrate ${sourceId} — status: ${String(doc.status)} → ${taskDoc.status as string}, priority: ${String(doc.priority)} → ${taskDoc.priority as string}`,
      );
      migrated++;
      continue;
    }

    try {
      const result = await tasksColl.insertOne(taskDoc);
      console.log(
        `[OK] ${sourceId} → task ${String(result.insertedId)} (status: ${String(doc.status)} → ${taskDoc.status as string})`,
      );
      migrated++;
    } catch (err) {
      console.error(`[ERR] Failed to migrate ${sourceId}:`, err);
      errors++;
    }
  }

  console.log(
    `\nDone: ${migrated} migrated, ${skipped} skipped (already done), ${errors} errors`,
  );

  if (DRY_RUN) {
    console.log('\nThis was a DRY RUN. Re-run without --dry-run to apply.');
  }

  await mongoose.disconnect();
}

migrate().catch((err) => {
  console.error('Migration failed:', err);
  process.exit(1);
});
