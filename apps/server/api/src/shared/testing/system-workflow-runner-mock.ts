// A deterministic stand-in for `SystemWorkflowRunnerService`. Production callers
// hand the runner a descriptor (`{ actionType, canonicalId, inputValues, ... }`)
// and the runner resolves the graph itself, so a test double has to own the same
// registry: definitions arrive through `registerWorkflow` (or are seeded up front
// for specs that construct a service which does not register its own graphs) and
// executors through `registerAction`.
import type {
  RunSystemWorkflowInput,
  SystemWorkflowGraphDefinition,
} from '@api/collections/workflows/system-workflow-definition';
import { vi } from 'vitest';

type ActionExecutor = (request: {
  context: Record<string, unknown>;
  input: Record<string, unknown>;
  provenance: Record<string, unknown>;
  runtimeContext?: unknown;
}) => unknown;

type GraphEdge = {
  source: string;
  sourceHandle?: string;
  target: string;
  targetHandle?: string;
};

type GraphNode = {
  data?: { config?: Record<string, unknown> };
  id: string;
};

export type SystemWorkflowRunnerMockOptions = {
  /** Graphs the spec's service does not register itself. */
  definitions?: SystemWorkflowGraphDefinition[];
  executionId?: string;
  workflowId?: string;
};

function readActionId(node: GraphNode): string {
  const actionId = node.data?.config?.actionId;
  if (typeof actionId !== 'string' || actionId.length === 0) {
    throw new Error(`Node ${node.id} is missing an action id`);
  }
  return actionId;
}

function readEdgeValue(source: unknown, sourceHandle?: string): unknown {
  return sourceHandle &&
    source &&
    typeof source === 'object' &&
    sourceHandle in source
    ? (source as Record<string, unknown>)[sourceHandle]
    : source;
}

export function createSystemWorkflowRunnerMock(
  options: SystemWorkflowRunnerMockOptions = {},
) {
  const executionId = options.executionId ?? 'execution-1';
  const workflowId = options.workflowId ?? 'workflow-1';
  const actionExecutors = new Map<string, ActionExecutor>();
  const workflowDefinitions = new Map<string, SystemWorkflowGraphDefinition>();

  for (const definition of options.definitions ?? []) {
    workflowDefinitions.set(definition.canonicalId, definition);
  }

  const resolveDefinition = (
    canonicalId: string,
  ): SystemWorkflowGraphDefinition => {
    const definition = workflowDefinitions.get(canonicalId);
    if (!definition) {
      throw new Error(`Unknown system workflow: ${canonicalId}`);
    }
    return definition;
  };

  const executeDefinition = async (
    definition: SystemWorkflowGraphDefinition,
    input: RunSystemWorkflowInput,
  ) => {
    const provenance = {
      executionId,
      workflowId,
      workflowLabel: definition.label,
    };
    const nodes = definition.definition.nodes as unknown as GraphNode[];
    const edges = definition.definition.edges as unknown as GraphEdge[];
    const outputs = new Map<string, unknown>();

    for (const node of nodes) {
      const actionId = readActionId(node);
      const executor = actionExecutors.get(actionId);
      if (!executor) {
        throw new Error(`Missing action executor: ${actionId}`);
      }
      const actionInput: Record<string, unknown> = { ...input.inputValues };
      for (const edge of edges.filter((candidate) => {
        return candidate.target === node.id;
      })) {
        actionInput[edge.targetHandle ?? edge.source] = readEdgeValue(
          outputs.get(edge.source),
          edge.sourceHandle,
        );
      }
      outputs.set(
        node.id,
        await executor({
          context: {
            executionId,
            organizationId: input.organizationId,
            runId: executionId,
            userId: input.userId,
            workflowId,
          },
          input: actionInput,
          provenance: { ...provenance, nodeId: node.id },
          runtimeContext: input.runtimeContext,
        }),
      );
    }

    return { provenance, result: outputs.get(definition.resultNodeId) };
  };

  return {
    /** Every graph the runner can execute, keyed by canonical id. */
    definitions: workflowDefinitions,
    /** Every registered executor, keyed by action id. */
    executors: actionExecutors,
    registerAction: vi.fn((actionId: string, executor: ActionExecutor) => {
      actionExecutors.set(actionId, executor);
    }),
    registerWorkflow: vi.fn((definition: SystemWorkflowGraphDefinition) => {
      workflowDefinitions.set(definition.canonicalId, definition);
    }),
    runDefinition: vi.fn(
      async (
        definition: SystemWorkflowGraphDefinition,
        input: RunSystemWorkflowInput,
      ) => executeDefinition(definition, input),
    ),
    runWorkflow: vi.fn(async (input: RunSystemWorkflowInput) =>
      executeDefinition(resolveDefinition(input.canonicalId), input),
    ),
  };
}

export type SystemWorkflowRunnerMock = ReturnType<
  typeof createSystemWorkflowRunnerMock
>;
