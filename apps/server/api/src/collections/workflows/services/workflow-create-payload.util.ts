import { createHash } from 'node:crypto';
import type { WorkflowInitiatingActor } from '@api/authorization/brand-access/workflow-actor.util';
import { CreateWorkflowDto } from '@api/collections/workflows/dto/create-workflow.dto';
import type {
  FeaturedWorkflowDocument,
  WorkflowDocument,
} from '@api/collections/workflows/schemas/workflow.schema';
import { buildSystemWorkflowDuplicateMetadata } from '@api/collections/workflows/system-workflow.contract';
import { WORKFLOW_TEMPLATES } from '@api/collections/workflows/templates/workflow-templates';
import {
  resolveScheduleInitiatingActor,
  type WorkflowSchedulePrincipal,
} from '@api/collections/workflows/utils/workflow-schedule-actor.util';
import { pickDefinedFields } from '@api/shared/utils/object/pick-defined-fields.util';
import { WorkflowStatus } from '@genfeedai/contracts';

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
  /** Server-resolved configuring principal; never read from `workflowData`. */
  scheduleInitiatingActor?: WorkflowInitiatingActor | null;
  userId: string;
  workflowData: WorkflowCreateExtras;
}): Record<string, unknown> {
  const {
    brandId,
    defaultLabel,
    organizationId,
    scheduleInitiatingActor,
    userId,
    workflowData,
  } = input;
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
      edgeStyle: workflowData.edgeStyle,
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
      scheduleInitiatingActor: scheduleInitiatingActor ?? undefined,
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

/**
 * Create payload for a duplicate of a visible workflow. The copy is a draft; a
 * protected system workflow loses its schedule and locks. An enabled schedule
 * is bound to the caller's principal, never to the source workflow's owner.
 */
export function buildWorkflowClonePayload(input: {
  brandId?: string;
  isProtectedSystemWorkflow: boolean;
  isSourceBrandAccessible: boolean;
  organizationId: string;
  schedulePrincipal?: WorkflowSchedulePrincipal;
  source: WorkflowDocument;
  targetBrandId?: string;
  userId: string;
}): Record<string, unknown> {
  const { brandId, isProtectedSystemWorkflow, source } = input;
  const label = `${source.label ?? 'Workflow'} (Copy)`;
  const schedule = isProtectedSystemWorkflow
    ? undefined
    : (source.schedule ?? undefined);
  const isScheduleEnabled = isProtectedSystemWorkflow
    ? false
    : source.isScheduleEnabled;

  return buildWorkflowCreatePayload({
    brandId,
    defaultLabel: label,
    organizationId: input.organizationId,
    scheduleInitiatingActor: resolveScheduleInitiatingActor({
      isEnabled: isScheduleEnabled,
      organizationId: input.organizationId,
      principal: input.schedulePrincipal,
      schedule,
    }),
    userId: input.userId,
    workflowData: {
      config: source.config,
      defaultRecurringBrandId: isProtectedSystemWorkflow
        ? null
        : input.targetBrandId ||
          (!input.isSourceBrandAccessible
            ? brandId
            : source.defaultRecurringBrandId) ||
          null,
      description: source.description ?? undefined,
      edges: source.edges,
      edgeStyle: source.edgeStyle,
      executionCount: 0,
      inputVariables: source.inputVariables,
      isScheduleEnabled,
      label,
      lastExecutedAt: undefined,
      lockedNodeIds: isProtectedSystemWorkflow
        ? []
        : (source.lockedNodeIds ?? []),
      metadata: buildSystemWorkflowDuplicateMetadata(
        source.metadata,
        source.id,
      ),
      nodes: source.nodes,
      progress: 0,
      recurrence: undefined,
      schedule,
      startedAt: undefined,
      status: WorkflowStatus.DRAFT,
      thumbnail: source.thumbnail ?? undefined,
      thumbnailNodeId: source.thumbnailNodeId ?? undefined,
      timezone: source.timezone ?? undefined,
    },
  });
}

/**
 * Create payload for a copy of an admin-pinned Featured workflow (#5511): a
 * draft in the caller's organization built only from the Featured projection
 * (label, description, thumbnail, graph). No config, schedule, locks, owner
 * or brand of the source organization carries over.
 */
export function buildFeaturedWorkflowCopyPayload(input: {
  brandId?: string;
  featured: FeaturedWorkflowDocument;
  organizationId: string;
  userId: string;
}): Record<string, unknown> {
  const { featured } = input;
  return buildWorkflowCreatePayload({
    brandId: input.brandId,
    defaultLabel: 'Featured workflow',
    organizationId: input.organizationId,
    userId: input.userId,
    workflowData: {
      description: featured.description ?? undefined,
      edges: featured.edges,
      edgeStyle: featured.edgeStyle,
      inputVariables: featured.inputVariables,
      label: featured.label ?? '',
      metadata: {
        sourceFeaturedWorkflowId: featured.id,
        sourceType: 'featured-workflow',
      },
      nodes: featured.nodes,
      status: WorkflowStatus.DRAFT,
      thumbnail: featured.thumbnail ?? undefined,
    },
  });
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

/**
 * When creating from a known template, fills graph/input-schema/schedule
 * fields the caller left empty. Non-template creates pass through unchanged.
 */
export function applyWorkflowTemplateDefaults(
  workflowData: CreateWorkflowDto,
  templateMetadata: Record<string, unknown> | undefined,
): CreateWorkflowDto {
  if (
    !workflowData.templateId ||
    !WORKFLOW_TEMPLATES[workflowData.templateId]
  ) {
    return workflowData;
  }

  const template = WORKFLOW_TEMPLATES[workflowData.templateId];
  const routineMetadata = template.routine
    ? { productizedRoutine: template.routine }
    : {};
  const shouldUseTemplateEdges =
    !workflowData.edges || workflowData.edges.length === 0;
  const shouldUseTemplateInputVariables =
    !workflowData.inputVariables || workflowData.inputVariables.length === 0;
  const shouldUseTemplateNodes =
    !workflowData.nodes || workflowData.nodes.length === 0;

  return {
    ...workflowData,
    edges: shouldUseTemplateEdges ? template.edges : workflowData.edges,
    inputVariables: shouldUseTemplateInputVariables
      ? template.inputVariables
      : workflowData.inputVariables,
    isScheduleEnabled:
      workflowData.isScheduleEnabled ?? template.isScheduleEnabled,
    metadata: {
      ...templateMetadata,
      ...routineMetadata,
      ...(workflowData.metadata ?? {}),
    },
    nodes: shouldUseTemplateNodes ? template.nodes : workflowData.nodes,
    schedule: workflowData.schedule ?? template.schedule,
    timezone: workflowData.timezone ?? template.timezone,
  };
}

export function hashTemplateInstantiationRequest(
  templateId: string,
  brandId?: string,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify([
        'workflow-template-instantiation:v1',
        templateId,
        brandId ?? null,
      ]),
    )
    .digest('hex');
}

/** Resolve template provenance together with the seeded graph/schedule defaults. */
export function prepareWorkflowTemplateCreation(
  workflowData: CreateWorkflowDto,
): CreateWorkflowDto {
  const templateMetadata = workflowData.templateId
    ? {
        sourceTemplateId: workflowData.templateId,
        sourceType: 'seeded-template',
      }
    : undefined;
  const resolved = applyWorkflowTemplateDefaults(
    workflowData,
    templateMetadata,
  );
  return {
    ...resolved,
    metadata:
      resolved.metadata || templateMetadata
        ? { ...templateMetadata, ...(resolved.metadata ?? {}) }
        : undefined,
  };
}
