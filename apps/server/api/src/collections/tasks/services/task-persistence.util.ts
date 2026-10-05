import type { TaskStatus } from '@api/collections/tasks/schemas/task.schema';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import type { Prisma } from '@genfeedai/prisma';

/**
 * A write guarded by `patchIfMatches`: typed columns plus a `config` patch
 * merged into the stored config JSON.
 */
export type TaskConditionalPatch = Pick<
  Prisma.TaskUncheckedUpdateManyInput,
  | 'completedAt'
  | 'failureReason'
  | 'progress'
  | 'requestedChangesReason'
  | 'reviewState'
  | 'rolledUpAt'
  | 'rollupLeaseExpiresAt'
  | 'rollupLeaseOwner'
> & {
  config?: Prisma.InputJsonObject;
  status?: TaskStatus;
};

export function readTaskConfigObject(
  value: Prisma.JsonValue,
): Prisma.JsonObject {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? value
    : {};
}

/** Task columns a write may set directly. */
export const TASK_SCALAR_FIELDS = [
  'assigneeAgentId',
  'assigneeUserId',
  'brandId',
  'checkedOutAt',
  'checkoutAgentId',
  'checkoutRunId',
  'completedAt',
  'decomposition',
  'description',
  'dismissedAt',
  'eventStream',
  'failureReason',
  'goalId',
  'identifier',
  'isDeleted',
  'organizationId',
  'parentId',
  'planningThreadId',
  'priority',
  'progress',
  'projectId',
  'requestedChangesReason',
  'reviewState',
  'status',
  'taskNumber',
  'title',
  'userId',
] as const;

/** Task fields persisted inside the `config` JSON column. */
export const TASK_CONFIG_FIELDS = [
  'chosenModel',
  'chosenProvider',
  'dismissedReason',
  'elevenlabsVoiceId',
  'executionPathUsed',
  'heygenAvatarId',
  'linkedApprovalIds',
  'linkedEntities',
  'linkedIssueId',
  'outputType',
  'outputTypeConfidence',
  'outputTypeSource',
  'platforms',
  'qualityAssessment',
  'request',
  'resultPreview',
  'reviewTriggered',
  'routingSummary',
  'skillsUsed',
  'skillVariantIds',
  'voiceId',
  'voiceProvider',
] as const;

export function readTaskRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/**
 * Map a task write onto its scalar columns and merged `config` JSON. Relation
 * writes (outputs, executions) are left to the caller.
 */
export function buildTaskColumnPatch(
  input: Record<string, unknown>,
  existingConfig: unknown,
): Record<string, unknown> {
  const configPatch = pickDefinedFields(input, TASK_CONFIG_FIELDS);
  const hasConfigPatch =
    Object.keys(configPatch).length > 0 || input.config !== undefined;
  return {
    ...pickDefinedFields(input, TASK_SCALAR_FIELDS),
    ...(hasConfigPatch
      ? {
          config: {
            ...readTaskRecord(existingConfig),
            ...readTaskRecord(input.config),
            ...configPatch,
          },
        }
      : {}),
  };
}
