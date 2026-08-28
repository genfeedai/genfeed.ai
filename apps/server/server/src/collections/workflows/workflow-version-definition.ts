import { createHash } from 'node:crypto';
import { getActionDefinition } from '@genfeedai/actions';
import { Prisma } from '@genfeedai/prisma';
import type {
  WorkflowDocument,
  WorkflowEdge,
  WorkflowInputVariable,
  WorkflowVersionDocument,
  WorkflowVersionGraph,
  WorkflowVisualNode,
} from '@server/collections/workflows/schemas/workflow.schema';

const ENGINE_NATIVE_NODE_TYPES = new Set([
  'commentTrigger',
  'condition',
  'control-branch',
  'control-delay',
  'control-loop',
  'delay',
  'engagementTrigger',
  'genfeedAction',
  'keywordTrigger',
  'mentionTrigger',
  'newFollowerTrigger',
  'newLikeTrigger',
  'newRepostTrigger',
  'postPublishTrigger',
  'reviewGate',
  'workflowInput',
]);

export interface WorkflowDefinitionInput {
  edges?: WorkflowEdge[];
  inputVariables?: WorkflowInputVariable[];
  lockedNodeIds?: string[];
  nodes?: WorkflowVisualNode[];
}

export function isEngineNativeWorkflowNodeType(nodeType: string): boolean {
  return (
    ENGINE_NATIVE_NODE_TYPES.has(nodeType) ||
    nodeType.startsWith('trigger-') ||
    nodeType === 'input-image' ||
    nodeType === 'input-video'
  );
}

function readRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function validateActionBackedNode(
  node: WorkflowVisualNode,
): WorkflowVisualNode {
  if (!isEngineNativeWorkflowNodeType(node.type)) {
    throw new Error(
      `Workflow node ${node.id} uses unsupported product node type ${node.type}; use a registered Genfeed action node`,
    );
  }
  if (node.type !== 'genfeedAction') {
    return node;
  }

  const actionId = readRecord(node.data?.config).actionId;
  if (typeof actionId !== 'string' || !getActionDefinition(actionId)) {
    throw new Error(
      `Workflow node ${node.id} references unknown Genfeed action ${String(actionId)}`,
    );
  }
  return node;
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map((item) => stableStringify(item)).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${stableStringify(record[key])}`)
      .join(',')}}`;
  }
  return JSON.stringify(value);
}

export function buildWorkflowVersionDefinition(
  input: WorkflowDefinitionInput,
): {
  contentHash: string;
  graph: WorkflowVersionGraph;
  inputSchema: WorkflowInputVariable[];
} {
  const graph: WorkflowVersionGraph = {
    edges: input.edges ?? [],
    lockedNodeIds: input.lockedNodeIds ?? [],
    nodes: (input.nodes ?? []).map(validateActionBackedNode),
  };
  const inputSchema = input.inputVariables ?? [];
  const contentHash = `sha256:v1:${createHash('sha256')
    .update(stableStringify({ graph, inputSchema }))
    .digest('hex')}`;

  return { contentHash, graph, inputSchema };
}

type VersionedWorkflowTransaction = Pick<
  Prisma.TransactionClient,
  'workflow' | 'workflowVersion'
>;

export async function createVersionedWorkflow(
  transaction: VersionedWorkflowTransaction,
  identityData: Prisma.WorkflowUncheckedCreateInput,
  definitionInput: WorkflowDefinitionInput,
) {
  const definition = buildWorkflowVersionDefinition(definitionInput);
  const identity = await transaction.workflow.create({ data: identityData });
  const version = await transaction.workflowVersion.create({
    data: {
      contentHash: definition.contentHash,
      graph: definition.graph as unknown as Prisma.InputJsonValue,
      inputSchema: definition.inputSchema as unknown as Prisma.InputJsonValue,
      organizationId: identity.organizationId,
      userId: identity.userId,
      version: 1,
      workflowId: identity.id,
    },
  });

  return transaction.workflow.update({
    data: { currentVersionId: version.id },
    include: { currentVersion: true },
    where: { id: identity.id },
  });
}

export function hydrateWorkflowDefinition(
  workflow: Record<string, unknown>,
): WorkflowDocument {
  const currentVersion = workflow.currentVersion as
    | WorkflowVersionDocument
    | null
    | undefined;
  if (!currentVersion) {
    throw new Error(`Workflow ${String(workflow.id)} has no current version`);
  }

  const graph = readRecord(currentVersion.graph);
  return {
    ...(workflow as unknown as WorkflowDocument),
    currentVersionId: currentVersion.id,
    edges: Array.isArray(graph.edges) ? (graph.edges as WorkflowEdge[]) : [],
    inputVariables: Array.isArray(currentVersion.inputSchema)
      ? currentVersion.inputSchema
      : [],
    lockedNodeIds: Array.isArray(graph.lockedNodeIds)
      ? graph.lockedNodeIds.filter(
          (nodeId): nodeId is string => typeof nodeId === 'string',
        )
      : [],
    nodes: Array.isArray(graph.nodes)
      ? (graph.nodes as WorkflowVisualNode[])
      : [],
    version: currentVersion.version,
    versionId: currentVersion.id,
  };
}

export const WORKFLOW_DEFINITION_FIELDS = [
  'edges',
  'inputVariables',
  'lockedNodeIds',
  'nodes',
] as const;

export function splitWorkflowDefinition(input: Record<string, unknown>): {
  definition: WorkflowDefinitionInput;
  workflow: Record<string, unknown>;
} {
  if ('steps' in input) {
    throw new Error(
      'Workflow.steps was removed; submit an action-backed graph',
    );
  }

  const workflow = { ...input };
  const definition: WorkflowDefinitionInput = {
    edges: Array.isArray(input.edges)
      ? (input.edges as WorkflowEdge[])
      : undefined,
    inputVariables: Array.isArray(input.inputVariables)
      ? (input.inputVariables as WorkflowInputVariable[])
      : undefined,
    lockedNodeIds: Array.isArray(input.lockedNodeIds)
      ? input.lockedNodeIds.filter(
          (nodeId): nodeId is string => typeof nodeId === 'string',
        )
      : undefined,
    nodes: Array.isArray(input.nodes)
      ? (input.nodes as WorkflowVisualNode[])
      : undefined,
  };

  for (const field of WORKFLOW_DEFINITION_FIELDS) {
    delete workflow[field];
  }

  return { definition, workflow };
}
