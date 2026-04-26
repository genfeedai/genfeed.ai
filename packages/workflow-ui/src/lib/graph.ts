import type { WorkflowEdge, WorkflowNode } from '@genfeedai/types';

import { createIdMap, createTargetMap } from './lookups';
import { getNodeOutputForHandle } from './nodeOutputs';

function appendConnectedInputValue(
  inputs: Map<string, string | string[]>,
  handleId: string,
  value: string,
): void {
  const existing = inputs.get(handleId);
  if (!existing) {
    inputs.set(handleId, value);
    return;
  }

  if (Array.isArray(existing)) {
    inputs.set(handleId, [...existing, value]);
    return;
  }

  inputs.set(handleId, [existing, value]);
}

export function getConnectedInputsForNode(
  nodeId: string,
  nodes: readonly WorkflowNode[],
  edges: readonly WorkflowEdge[],
): Map<string, string | string[]> {
  const inputs = new Map<string, string | string[]>();
  const nodeMap = createIdMap(nodes);
  const edgesByTarget = createTargetMap(edges);
  const incomingEdges = edgesByTarget.get(nodeId) ?? [];

  for (const edge of incomingEdges) {
    const sourceNode = nodeMap.get(edge.source);
    const handleId = edge.targetHandle;

    if (!sourceNode || !handleId) {
      continue;
    }

    const value = getNodeOutputForHandle(sourceNode, edge.sourceHandle);
    if (!value) {
      continue;
    }

    appendConnectedInputValue(inputs, handleId, value);
  }

  return inputs;
}

export function getUpstreamNodeIds(
  nodeIds: readonly string[],
  edges: readonly WorkflowEdge[],
): string[] {
  const connected = new Set<string>(nodeIds);
  const visited = new Set<string>();
  const edgesByTarget = createTargetMap(edges);
  const queue = [...nodeIds];

  while (queue.length > 0) {
    const currentId = queue.shift();
    if (!currentId || visited.has(currentId)) {
      continue;
    }

    visited.add(currentId);
    const upstreamEdges = edgesByTarget.get(currentId) ?? [];

    for (const edge of upstreamEdges) {
      if (connected.has(edge.source)) {
        continue;
      }

      connected.add(edge.source);
      queue.push(edge.source);
    }
  }

  return Array.from(connected);
}
