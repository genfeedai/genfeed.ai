import { createInitialWorkflowNodeState } from '@api/collections/workflows/utils/workflow-initial-node-state.util';
import type {
  WorkflowAdmissionExecutableV1,
  WorkflowAdmissionRedactedSourceV1,
  WorkflowGenerationAdmissionSourceV1,
} from '@api/collections/workflows/workflow-generation-admission.interface';
import {
  workflowAdmissionExecutableSchema,
  workflowGenerationAdmissionSourceSchema,
} from '@api/collections/workflows/workflow-generation-admission.schema';
import { BusinessLogicException } from '@api/exceptions/business-logic.exception';
import { quoteSnapshotHash } from '@api/helpers/utils/credits/quote-snapshot.util';
import { assertWorkflowCanonicalJson } from '@api/helpers/utils/credits/workflow-media-dispatch-input.util';
import {
  planPartialExecution,
  topologicalSort,
} from '@genfeedai/workflows/engine';

function invalid(): never {
  throw new BusinessLogicException('Workflow admission source is invalid');
}
function projectShape(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
): Record<string, unknown> {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value))
  )
    invalid();
  const keys = new Set([...required, ...optional]);
  const projected: Record<string, unknown> = {};
  for (const key of Reflect.ownKeys(value)) {
    if (typeof key !== 'string' || !keys.has(key)) invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      invalid();
    if (descriptor.value === undefined && optional.includes(key)) continue;
    projected[key] = descriptor.value;
  }
  for (const key of required) if (!Object.hasOwn(projected, key)) invalid();
  return projected;
}
function projectArray(
  value: unknown,
  required: readonly string[],
  optional: readonly string[],
): Record<string, unknown>[] {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype)
    invalid();
  for (const key of Reflect.ownKeys(value)) {
    if (key === 'length') continue;
    if (
      typeof key !== 'string' ||
      !/^(0|[1-9]\d*)$/.test(key) ||
      Number(key) >= value.length
    )
      invalid();
    const descriptor = Object.getOwnPropertyDescriptor(value, key);
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor, 'value'))
      invalid();
  }
  const projected: Record<string, unknown>[] = [];
  for (let index = 0; index < value.length; index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
    if (!descriptor || !Object.hasOwn(descriptor, 'value')) invalid();
    projected.push(projectShape(descriptor.value, required, optional));
  }
  return projected;
}
/** Explicit converter projection: only known optional structural undefined values may be omitted. */
export function projectWorkflowAdmissionExecutable(
  value: unknown,
): WorkflowAdmissionExecutableV1 {
  const workflow = projectShape(
    value,
    [
      'id',
      'versionId',
      'organizationId',
      'userId',
      'nodes',
      'edges',
      'lockedNodeIds',
    ],
    ['brandId', 'emitSharedEvents', 'isCustomerWorkflow'],
  );
  workflow.nodes = projectArray(
    workflow.nodes,
    ['id', 'type', 'label', 'config', 'inputs'],
    ['isLocked', 'cachedOutput'],
  );
  workflow.edges = projectArray(
    workflow.edges,
    ['id', 'source', 'target'],
    ['sourceHandle', 'targetHandle'],
  );
  assertWorkflowCanonicalJson(workflow);
  const parsed = workflowAdmissionExecutableSchema.parse(workflow);
  if (quoteSnapshotHash(parsed) !== quoteSnapshotHash(workflow)) invalid();
  return structuredClone(parsed);
}
function unique(ids: readonly string[]): void {
  if (new Set(ids).size !== ids.length) invalid();
}
/** Parse stored evidence only; a hash is not authority to create an execution, hold or provider attempt. */
export function parseWorkflowGenerationAdmissionSource(
  value: unknown,
): WorkflowGenerationAdmissionSourceV1 {
  assertWorkflowCanonicalJson(value);
  const source = workflowGenerationAdmissionSourceSchema.parse(value);
  if (source.state === 'redacted') return structuredClone(source);
  const { sourceHash, ...body } = source;
  if (
    quoteSnapshotHash(body) !== sourceHash ||
    quoteSnapshotHash(source) !== quoteSnapshotHash(value)
  )
    invalid();
  const workflow = source.workflow;
  if (
    workflow.id !== source.workflowId ||
    workflow.versionId !== source.workflowVersionId ||
    workflow.organizationId !== source.organizationId ||
    workflow.userId !== source.actorUserId ||
    (workflow.brandId ?? null) !== source.brandId
  )
    invalid();
  const nodeIds = workflow.nodes.map((node) => node.id);
  const nodeSet = new Set(nodeIds);
  unique(nodeIds);
  unique(workflow.edges.map((edge) => edge.id));
  unique(workflow.lockedNodeIds);
  unique(source.selectedNodeIds);
  unique(source.initiallyCompletedNodeIds);
  if (
    workflow.edges.some(
      (edge) => !nodeSet.has(edge.source) || !nodeSet.has(edge.target),
    ) ||
    workflow.lockedNodeIds.some((id) => !nodeSet.has(id))
  )
    invalid();
  const selection = source.selection;
  if (selection.mode === 'partial') {
    unique(selection.requestedNodeIds);
    if (selection.requestedNodeIds.some((id) => !nodeSet.has(id))) invalid();
  }
  const initial = createInitialWorkflowNodeState(workflow, source.trigger, {
    respectLocks: selection.respectLocks,
    ...(selection.mode === 'partial'
      ? { selectedNodeIds: selection.requestedNodeIds }
      : {}),
  });
  const order = topologicalSort(workflow.nodes, workflow.edges);
  if (order.length !== workflow.nodes.length) invalid();
  const partial =
    selection.mode === 'partial'
      ? planPartialExecution(
          selection.requestedNodeIds,
          workflow.nodes,
          workflow.edges,
          initial.nodeCache,
        )
      : null;
  if (partial && !partial.isValid) invalid();
  if (
    quoteSnapshotHash(source.selectedNodeIds) !==
      quoteSnapshotHash(partial?.executionOrder ?? order) ||
    quoteSnapshotHash(source.initialNodeOutputs) !==
      quoteSnapshotHash(Object.fromEntries(initial.nodeCache)) ||
    quoteSnapshotHash(source.initiallyCompletedNodeIds) !==
      quoteSnapshotHash([...initial.completedNodes])
  )
    invalid();
  return structuredClone(source);
}
/** Existing payload scrubbing keeps only non-content hashes; malformed evidence is cleared. */
export function redactWorkflowGenerationAdmissionSource(
  value: unknown,
): WorkflowAdmissionRedactedSourceV1 | null {
  try {
    const source = parseWorkflowGenerationAdmissionSource(value);
    if (source.state === 'redacted') return source;
    return {
      version: 1,
      state: 'redacted',
      reason: 'execution-payload-retention',
      requestHash: source.requestHash,
      sourceHash: source.sourceHash,
    };
  } catch {
    return null;
  }
}
