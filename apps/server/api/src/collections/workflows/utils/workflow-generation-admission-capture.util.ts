import { buildPlaygroundNativeExtendWorkflowDefinition, PLAYGROUND_NATIVE_EXTEND_WORKFLOW_ID, buildPlaygroundFabricatedExtendWorkflowDefinition, PLAYGROUND_FABRICATED_EXTEND_WORKFLOW_ID } from '@api/collections/workflows/services/playground-extend-workflow-definition';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import { WorkflowEngineConverterService } from '@api/collections/workflows/services/workflow-engine-converter.service';
import { EXECUTABLE_WORKFLOW_IDENTITY_SELECT } from '@api/collections/workflows/services/workflow-executor.constants';
import {
  getSystemWorkflowMetadata,
  isHiddenSystemWorkflowMetadata,
  SYSTEM_WORKFLOW_PRINCIPAL_ID,
} from '@api/collections/workflows/system-workflow.contract';
import {
  parseWorkflowGenerationAdmissionSource,
  projectWorkflowAdmissionExecutable,
} from '@api/collections/workflows/utils/workflow-generation-admission-source.util';
import { createInitialWorkflowNodeState } from '@api/collections/workflows/utils/workflow-initial-node-state.util';
import type {
  WorkflowAdmissionAvailableSourceV1,
  WorkflowGenerationAdmissionSourceV1,
  WorkflowGenerationSelection,
} from '@api/collections/workflows/workflow-generation-admission.interface';
import { hydrateWorkflowDefinition } from '@api/collections/workflows/workflow-version-definition';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import type { Prisma } from '@genfeedai/prisma';
import {
  planPartialExecution,
  topologicalSort,
} from '@genfeedai/workflows/engine';

export interface WorkflowGenerationAdmissionCaptureInput {
  actorUserId: string;
  apiKeyId?: string;
  actorScopes?: string[];
  /** Internal runner identity, never a DTO or caller-controlled metadata value. */
  systemWorkflowCanonicalId?: string;
  organizationId: string;
  selection: WorkflowGenerationSelection;
  trigger: {
    data: Record<string, unknown>;
    platform: string;
    type: string;
  };
  workflowId: string;
  workflowVersionId: string;
}

function unavailable(detail: string): never {
  throw new BusinessLogicException(detail);
}

export function workflowGenerationAdmissionRequestHash(
  input: WorkflowGenerationAdmissionCaptureInput,
): string {
  return quoteSnapshotHash({
    actorUserId: input.actorUserId,
    ...(input.apiKeyId ? { apiKeyId: input.apiKeyId, actorScopes: input.actorScopes ?? [] } : {}),
    ...(input.systemWorkflowCanonicalId ? { systemWorkflowCanonicalId: input.systemWorkflowCanonicalId } : {}),
    organizationId: input.organizationId,
    selection: input.selection,
    trigger: input.trigger,
    workflowId: input.workflowId,
    workflowVersionId: input.workflowVersionId,
  });
}

function isGlobalHiddenMirror(version: {
  organizationId: string;
  userId: string;
  workflow: {
    metadata: unknown;
    organizationId: string;
    userId: string;
  };
}): boolean {
  return (
    version.organizationId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
    version.userId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
    version.workflow.organizationId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
    version.workflow.userId === SYSTEM_WORKFLOW_PRINCIPAL_ID &&
    isHiddenSystemWorkflowMetadata(version.workflow.metadata)
  );
}

export function buildWorkflowGenerationAdmissionSource(
  input: WorkflowGenerationAdmissionCaptureInput,
  workflow: WorkflowAdmissionAvailableSourceV1['workflow'],
  workflowVersionContentHash: string,
): WorkflowAdmissionAvailableSourceV1 {
  const requestHash = workflowGenerationAdmissionRequestHash(input);
  const initial = createInitialWorkflowNodeState(workflow, input.trigger, {
    respectLocks: input.selection.respectLocks,
    ...(input.selection.mode === 'partial'
      ? { selectedNodeIds: input.selection.requestedNodeIds }
      : {}),
  });
  const order = topologicalSort(workflow.nodes, workflow.edges);
  const partial =
    input.selection.mode === 'partial'
      ? planPartialExecution(
          input.selection.requestedNodeIds,
          workflow.nodes,
          workflow.edges,
          initial.nodeCache,
        )
      : null;
  if (partial && !partial.isValid) unavailable('Workflow selection is invalid');
  const body = {
    actorUserId: input.actorUserId,
    ...(input.apiKeyId ? { apiKeyId: input.apiKeyId, actorScopes: input.actorScopes ?? [] } : {}),
    brandId: workflow.brandId ?? null,
    initiallyCompletedNodeIds: [...initial.completedNodes],
    initialNodeOutputs: Object.fromEntries(initial.nodeCache),
    organizationId: input.organizationId,
    preparationVersion: 1 as const,
    requestHash,
    selectedNodeIds: partial?.executionOrder ?? order,
    selection: input.selection,
    state: 'available' as const,
    trigger: input.trigger,
    version: 1 as const,
    workflow,
    workflowId: input.workflowId,
    workflowVersionContentHash,
    workflowVersionId: input.workflowVersionId,
  };
  return parseWorkflowGenerationAdmissionSource({
    ...body,
    sourceHash: quoteSnapshotHash(body),
  }) as WorkflowAdmissionAvailableSourceV1;
}

export function assertWorkflowAdmissionRequestMatch(
  stored: unknown,
  input: WorkflowGenerationAdmissionCaptureInput,
): void {
  if (stored == null) return;
  const source = parseWorkflowGenerationAdmissionSource(stored);
  if (source.state === 'redacted') {
    if (source.requestHash !== workflowGenerationAdmissionRequestHash(input))
      unavailable('Workflow retry cannot replace its frozen admission request');
    return;
  }
  if (source.requestHash !== workflowGenerationAdmissionRequestHash(input))
    unavailable('Workflow retry cannot replace its frozen admission request');
}

/** Authoritative capture from the pin; only explicitly registered Extend mirrors receive funding admission. */
export async function captureWorkflowGenerationAdmissionSource(
  tx: Prisma.TransactionClient,
  input: WorkflowGenerationAdmissionCaptureInput,
): Promise<WorkflowGenerationAdmissionSourceV1 | null> {
  const version = await tx.workflowVersion.findFirst({
    select: {
      contentHash: true,
      graph: true,
      id: true,
      inputSchema: true,
      organizationId: true,
      userId: true,
      version: true,
      workflow: { select: EXECUTABLE_WORKFLOW_IDENTITY_SELECT },
    },
    where: {
      id: input.workflowVersionId,
      workflowId: input.workflowId,
    },
  });
  if (!version) unavailable('Workflow admission version is unavailable');
  const hidden = isGlobalHiddenMirror(version);
  if (hidden) {
    if (!input.systemWorkflowCanonicalId) return null;
    if (![PLAYGROUND_NATIVE_EXTEND_WORKFLOW_ID, PLAYGROUND_FABRICATED_EXTEND_WORKFLOW_ID].includes(input.systemWorkflowCanonicalId) || getSystemWorkflowMetadata(version.workflow.metadata)?.canonicalId !== input.systemWorkflowCanonicalId || version.workflow.isDeleted) unavailable('System generation admission is unavailable');
    const expected = buildWorkflowVersionDefinition((input.systemWorkflowCanonicalId === PLAYGROUND_NATIVE_EXTEND_WORKFLOW_ID ? buildPlaygroundNativeExtendWorkflowDefinition() : buildPlaygroundFabricatedExtendWorkflowDefinition()).definition);
    if (version.contentHash !== expected.contentHash) unavailable('System generation definition differs from its registered pin');
    const actual = buildWorkflowVersionDefinition({ ...version.graph as unknown as typeof expected.graph, inputVariables: version.inputSchema as unknown as typeof expected.inputSchema });
    if (actual.contentHash !== expected.contentHash) unavailable('System generation graph differs from its registered pin');
  } else if (input.systemWorkflowCanonicalId) unavailable('System generation mirror ownership is unavailable');
  const isTenantOwned =
    version.organizationId === input.organizationId &&
    version.organizationId === version.workflow.organizationId &&
    version.userId === version.workflow.userId;
  if ((!hidden && !isTenantOwned) || version.workflow.isDeleted)
    unavailable('Workflow admission identity is unavailable');
  const document = hydrateWorkflowDefinition({
    ...version.workflow,
    currentVersion: version,
    organizationId: input.organizationId,
    userId: input.actorUserId,
  });
  const converter = new WorkflowEngineConverterService();
  const executable = converter.applyRuntimeInputValues(
    document,
    converter.convertToExecutableWorkflow(document),
    input.trigger.data,
  );
  return buildWorkflowGenerationAdmissionSource(
    input,
    projectWorkflowAdmissionExecutable(executable),
    version.contentHash,
  );
}
