import { WorkflowStatus } from '@genfeedai/enums';
import { CreateWorkflowDto } from '@server/collections/workflows/dto/create-workflow.dto';
import { pickDefinedFields } from '@server/shared/utils/object/pick-defined-fields.util';

export const WORKFLOW_CONFIG_FIELDS = [
  'comfyuiTemplate',
  'isPublic',
  'isTemplate',
  'scheduledFor',
  'sourceAsset',
  'sourceAssetModel',
  'tags',
  'templateId',
  'webhookAuthType',
  'webhookId',
  'webhookLastTriggeredAt',
  'webhookSecret',
  'webhookTriggerCount',
] as const;

export type WorkflowCreateExtras = CreateWorkflowDto &
  Partial<Record<(typeof WORKFLOW_CONFIG_FIELDS)[number], unknown>> & {
    brandId?: string | null;
    config?: Record<string, unknown>;
    defaultRecurringBrandId?: string | null;
    lifecycle?: string | null;
    lockedNodeIds?: string[];
  };

export function resolveWorkflowBrandId(
  value: unknown,
  fallbackBrandId?: string,
): string | undefined {
  return typeof value === 'string' && value.length > 0
    ? value
    : fallbackBrandId;
}

export function buildWorkflowCreatePayload(input: {
  brandId?: string;
  defaultLabel: string;
  organizationId: string;
  userId: string;
  workflowData: WorkflowCreateExtras;
}): Record<string, unknown> {
  const { brandId, defaultLabel, organizationId, userId, workflowData } = input;
  const config = {
    ...(workflowData.config ?? {}),
    ...pickDefinedFields(workflowData, WORKFLOW_CONFIG_FIELDS),
  };

  return Object.fromEntries(
    Object.entries({
      brandId,
      config,
      defaultRecurringBrandId: workflowData.defaultRecurringBrandId,
      description: workflowData.description,
      edges: workflowData.edges ?? [],
      executionCount: workflowData.executionCount ?? 0,
      inputVariables: workflowData.inputVariables ?? [],
      isScheduleEnabled: workflowData.isScheduleEnabled,
      label: workflowData.label || defaultLabel,
      lastExecutedAt: workflowData.lastExecutedAt,
      lifecycle: workflowData.lifecycle,
      lockedNodeIds: workflowData.lockedNodeIds,
      metadata: workflowData.metadata,
      nodes: workflowData.nodes ?? [],
      organizationId,
      progress: workflowData.progress ?? 0,
      recurrence: workflowData.recurrence,
      schedule: workflowData.schedule,
      startedAt: workflowData.startedAt,
      status: workflowData.status ?? WorkflowStatus.ACTIVE,
      thumbnail: workflowData.thumbnail,
      thumbnailNodeId: workflowData.thumbnailNodeId,
      timezone: workflowData.timezone,
      trigger: workflowData.trigger,
      userId,
    }).filter(([, value]) => value !== undefined),
  );
}

export function getDefaultInputValuesFromWorkflowData(
  workflowData: Pick<CreateWorkflowDto, 'inputVariables'>,
): Record<string, unknown> {
  const defaults: Record<string, unknown> = {};
  for (const variable of workflowData.inputVariables ?? []) {
    if (variable.defaultValue !== undefined) {
      defaults[variable.key] = variable.defaultValue;
    }
  }
  return defaults;
}

export function getMissingRequiredInputKeys(
  workflowData: Pick<CreateWorkflowDto, 'inputVariables'>,
  inputValues: Record<string, unknown>,
): string[] {
  return (workflowData.inputVariables ?? [])
    .filter(
      (variable) =>
        variable.required && isMissingInputValue(inputValues[variable.key]),
    )
    .map((variable) => variable.key);
}

function isMissingInputValue(value: unknown): boolean {
  return (
    value === undefined ||
    value === null ||
    (typeof value === 'string' && value.trim().length === 0)
  );
}
