/**
 * Workspace-task realtime snapshot builder.
 *
 * Produces the flat `payload.task` / `payload.progress` shapes broadcast over
 * the workspace-task websocket channels. This is the single source of truth for
 * that wire shape — it used to live as private `serialize*` methods inside the
 * API `TasksService`, violating the repo rule that serialization belongs in
 * `packages/serializers`. The output is intentionally byte-compatible with the
 * previous in-service serialization (the frontend consumes `payload.task` as a
 * flat object via `new Task(payload.task)`, not a JSON:API envelope).
 */

type IdLike = string | { toString(): string };

export interface WorkspaceTaskProgressInput {
  activeRunCount?: number | null;
  message?: string | null;
  percent?: number | null;
  stage?: string | null;
}

export interface WorkspaceTaskProgressSnapshot {
  activeRunCount: number;
  message?: string | null;
  percent: number;
  stage?: string | null;
}

export interface WorkspaceTaskEventInput {
  createdAt?: Date | string | null;
  id?: string;
  payload?: Record<string, unknown>;
  timestamp?: Date | string | null;
  type?: string;
  userId?: string;
}

export interface WorkspaceTaskRealtimeSnapshotInput {
  approvedOutputIds?: IdLike[] | null;
  chosenModel?: unknown;
  chosenProvider?: unknown;
  completedAt?: Date | string | null;
  createdAt?: Date | string | null;
  decomposition?: unknown;
  dismissedAt?: Date | string | null;
  dismissedReason?: unknown;
  eventStream?: WorkspaceTaskEventInput[] | null;
  executionPathUsed?: unknown;
  failureReason?: unknown;
  linkedApprovalIds?: IdLike[] | null;
  linkedOutputIds?: IdLike[] | null;
  linkedRunIds?: IdLike[] | null;
  outputType?: unknown;
  planningThreadId?: IdLike | null;
  platforms?: unknown;
  priority?: unknown;
  progress?: WorkspaceTaskProgressInput | null;
  qualityAssessment?: unknown;
  request?: unknown;
  requestedChangesReason?: unknown;
  resultPreview?: unknown;
  reviewState?: unknown;
  reviewTriggered?: unknown;
  routingSummary?: unknown;
  skillVariantIds?: IdLike[] | null;
  skillsUsed?: unknown;
  status?: unknown;
  title?: unknown;
  updatedAt?: Date | string | null;
  // Record-accessed fields (brandId / id / organizationId) are not first-class
  // columns on the wire shape but are emitted inline.
  [key: string]: unknown;
}

export function serializeWorkspaceTaskDate(value: unknown): string | undefined {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export function serializeWorkspaceTaskProgress(
  progress: WorkspaceTaskProgressInput | null | undefined,
): WorkspaceTaskProgressSnapshot {
  return {
    activeRunCount: progress?.activeRunCount ?? 0,
    message: progress?.message,
    percent: progress?.percent ?? 0,
    stage: progress?.stage,
  };
}

export function serializeWorkspaceTaskEvent(
  event: WorkspaceTaskEventInput,
): Record<string, unknown> {
  const createdAt = event.createdAt ?? event.timestamp;
  const timestamp =
    serializeWorkspaceTaskDate(event.timestamp) ??
    serializeWorkspaceTaskDate(event.createdAt);

  return {
    createdAt: serializeWorkspaceTaskDate(createdAt),
    id: event.id,
    payload: event.payload,
    timestamp,
    type: event.type,
    userId: event.userId,
  };
}

export function buildWorkspaceTaskRealtimeSnapshot(
  task: WorkspaceTaskRealtimeSnapshotInput,
): Record<string, unknown> {
  const approvedOutputIds = task.approvedOutputIds ?? [];
  const linkedApprovalIds = task.linkedApprovalIds ?? [];
  const linkedOutputIds = task.linkedOutputIds ?? [];
  const linkedRunIds = task.linkedRunIds ?? [];
  const skillVariantIds = task.skillVariantIds ?? [];
  const eventStream = task.eventStream ?? [];

  return {
    approvedOutputIds: approvedOutputIds.map((id) => id.toString()),
    brandId: task.brandId,
    chosenModel: task.chosenModel,
    chosenProvider: task.chosenProvider,
    completedAt: serializeWorkspaceTaskDate(task.completedAt),
    createdAt: serializeWorkspaceTaskDate(task.createdAt),
    decomposition: task.decomposition,
    dismissedAt: serializeWorkspaceTaskDate(task.dismissedAt),
    dismissedReason: task.dismissedReason,
    eventStream: eventStream.map((event) => serializeWorkspaceTaskEvent(event)),
    executionPathUsed: task.executionPathUsed,
    failureReason: task.failureReason,
    id: task.id,
    linkedApprovalIds: linkedApprovalIds.map((id) => id.toString()),
    linkedOutputIds: linkedOutputIds.map((id) => id.toString()),
    linkedRunIds: linkedRunIds.map((id) => id.toString()),
    organizationId: task.organizationId,
    outputType: task.outputType,
    planningThreadId: task.planningThreadId?.toString(),
    platforms: task.platforms,
    priority: task.priority,
    progress: serializeWorkspaceTaskProgress(task.progress),
    qualityAssessment: task.qualityAssessment,
    request: task.request,
    requestedChangesReason: task.requestedChangesReason,
    resultPreview: task.resultPreview,
    reviewState: task.reviewState,
    reviewTriggered: task.reviewTriggered,
    routingSummary: task.routingSummary,
    skillsUsed: task.skillsUsed,
    skillVariantIds: skillVariantIds.map((id) => id.toString()),
    status: task.status,
    title: task.title,
    updatedAt: serializeWorkspaceTaskDate(task.updatedAt),
  };
}
