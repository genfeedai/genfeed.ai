import type { SystemWorkflowGraphDefinition } from '@api/collections/workflows/system-workflow-definition';
import {
  PLATFORM_WORKFLOW_SCHEDULE_SOURCE,
  PROACTIVE_AGENT_TURN_SOURCE,
} from '@api/collections/workflows/system-workflow-definition';
import { buildWorkflowVersionDefinition } from '@api/collections/workflows/workflow-version-definition';
import { PrismaService } from '@api/shared/modules/prisma/prisma.service';
import {
  type GenfeedActionDefinition,
  getActionDefinition,
} from '@genfeedai/actions';
import { SystemWorkflowDispatchClass } from '@genfeedai/contracts/queue';
import {
  readString as optionalString,
  readRecord,
} from '@genfeedai/utils/data/extract.util';
import type { ExecutionContext } from '@genfeedai/workflows/engine';
export type SystemWorkflowProvenance = {
  executionId: string;
  idempotencyKey?: string;
  nodeId?: string;
  workflowId: string;
  workflowLabel: string;
};

export type SystemWorkflowActionRequest = {
  context: ExecutionContext;
  input: Record<string, unknown>;
  provenance: SystemWorkflowProvenance;
  runtimeContext?: unknown;
};

// Action handlers are either pure state transforms or async I/O. `registerAction`
// wraps every executor in an async node executor, so both shapes are awaited.
export type SystemWorkflowActionExecutor = (
  request: SystemWorkflowActionRequest,
) => unknown;

export function resolveDefinition(
  actionDefinitions: ReadonlyMap<string, GenfeedActionDefinition>,
  actionId: string,
): GenfeedActionDefinition {
  const registeredDefinition = actionDefinitions.get(actionId);
  if (registeredDefinition) {
    return registeredDefinition;
  }
  const action = getActionDefinition(actionId);
  if (!action) {
    throw new Error(`Unknown Genfeed action: ${actionId}`);
  }
  return action;
}

export function validateDefinition(
  definition: SystemWorkflowGraphDefinition,
): void {
  const version = buildWorkflowVersionDefinition(definition.definition);
  if (
    definition.failureWorkflowCanonicalId !== undefined &&
    (!definition.failureWorkflowCanonicalId.trim() ||
      definition.failureWorkflowCanonicalId === definition.canonicalId)
  ) {
    throw new Error('Invalid code-owned system workflow failure definition');
  }
  if (
    definition.moduleCompletionNodeIds?.some(
      (nodeId) =>
        !version.graph.nodes.some(
          (node) =>
            node.id === nodeId &&
            node.type === 'genfeedAction' &&
            typeof readRecord(node.data?.config).actionId === 'string',
        ),
    ) ||
    (definition.moduleCompletionNodeIds?.length &&
      !definition.organizationModule)
  ) {
    throw new Error('Invalid code-owned system workflow completion nodes');
  }
  if (
    !version.graph.nodes.some((node) => node.id === definition.resultNodeId)
  ) {
    throw new Error(
      `System workflow ${definition.canonicalId} result node ${definition.resultNodeId} does not exist`,
    );
  }
}

export function assertDefinitionExecutors(
  definition: SystemWorkflowGraphDefinition,
  actionIds: string[],
): void {
  const registeredActionIds = new Set(actionIds);
  const missingActionIds = definition.definition.nodes.flatMap((node) => {
    if (node.type !== 'genfeedAction') {
      return [];
    }
    const actionId = optionalString(readRecord(node.data?.config).actionId);
    return actionId && !registeredActionIds.has(actionId) ? [actionId] : [];
  });
  if (missingActionIds.length > 0) {
    throw new Error(
      `System workflow action executors missing: ${[
        ...new Set(missingActionIds),
      ]
        .sort()
        .map((actionId) => `${definition.canonicalId}:${actionId}`)
        .join(', ')}`,
    );
  }
}

export function requiredString(value: unknown, field: string): string {
  const parsed = optionalString(value);
  if (!parsed) {
    throw new Error(`${field} is required`);
  }
  return parsed;
}

/**
 * Whether `source` on an `enqueueWorkflow` call identifies platform
 * background work rather than a live interactive request — see
 * `PLATFORM_WORKFLOW_SCHEDULE_SOURCE` and `PROACTIVE_AGENT_TURN_SOURCE`.
 */
export function isPlatformOriginatedSource(source: string): boolean {
  return (
    source === PLATFORM_WORKFLOW_SCHEDULE_SOURCE ||
    source === PROACTIVE_AGENT_TURN_SOURCE
  );
}

/**
 * How a `workflow.for-each` node's `scheduled`-mode children should route,
 * inherited from the PARENT EXECUTION's own persisted dispatch rather than
 * inferred from the workflow's canonical id (#5271, replacing the
 * `isPlatformSweepWorkflow` canonical-id check #5162/#5252 shipped).
 *
 * `enqueueWorkflow` persists both `source` and `dispatchClass` into
 * `WorkflowExecution.result.metadata` at creation time — `source` was
 * already there for `isPlatformOriginatedSource`; no schema migration was
 * needed to add `dispatchClass` alongside it. A run started through any
 * other path (direct `queueSystemWorkflow`, or a synchronous `runWorkflow`)
 * never has `dispatchClass` in its metadata; those producers are already
 * all background in nature (#5271's audit), so a missing value defaults to
 * `BACKGROUND` rather than risking a for-each fan-out landing on the
 * interactive queue by accident.
 */
export async function resolveInheritedDispatch(
  prisma: PrismaService,
  executionId: string,
  organizationId: string,
): Promise<{
  dispatchClass: SystemWorkflowDispatchClass;
  usePlatformQueue: boolean;
}> {
  const execution = await prisma.workflowExecution.findFirst({
    select: { result: true },
    where: { id: executionId, isDeleted: false, organizationId },
  });
  const metadata = readRecord(readRecord(execution?.result).metadata);
  const source = optionalString(metadata.source);
  const dispatchClass =
    Object.values(SystemWorkflowDispatchClass).find(
      (value) => value === metadata.dispatchClass,
    ) ?? SystemWorkflowDispatchClass.BACKGROUND;
  return {
    dispatchClass,
    usePlatformQueue:
      source !== undefined && isPlatformOriginatedSource(source),
  };
}
