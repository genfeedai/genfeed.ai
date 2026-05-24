import type { WorkflowEdge, WorkflowNode } from '@genfeedai/types';
import { describe, expect, it } from 'vitest';

import { getConnectedInputsForNode, getUpstreamNodeIds } from './graph';

const nodes: WorkflowNode[] = [
  {
    data: { outputText: 'prompt text' },
    id: 'prompt-1',
    position: { x: 0, y: 0 },
    type: 'prompt',
  } as WorkflowNode,
  {
    data: { outputImage: 'image-a.png' },
    id: 'image-1',
    position: { x: 100, y: 0 },
    type: 'imageGen',
  } as WorkflowNode,
  {
    data: { image: 'image-b.png' },
    id: 'image-2',
    position: { x: 200, y: 0 },
    type: 'image',
  } as WorkflowNode,
];

const edges: WorkflowEdge[] = [
  {
    id: 'edge-1',
    source: 'prompt-1',
    sourceHandle: 'text',
    target: 'node-target',
    targetHandle: 'inputPrompt',
    type: 'default',
  } as WorkflowEdge,
  {
    id: 'edge-2',
    source: 'image-1',
    sourceHandle: 'image',
    target: 'node-target',
    targetHandle: 'inputImages',
    type: 'default',
  } as WorkflowEdge,
  {
    id: 'edge-3',
    source: 'image-2',
    sourceHandle: 'image',
    target: 'node-target',
    targetHandle: 'inputImages',
    type: 'default',
  } as WorkflowEdge,
  {
    id: 'edge-4',
    source: 'prompt-1',
    sourceHandle: 'text',
    target: 'image-1',
    targetHandle: 'inputPrompt',
    type: 'default',
  } as WorkflowEdge,
];

describe('getConnectedInputsForNode', () => {
  it('collects scalar and multi-value connected inputs by handle', () => {
    const inputs = getConnectedInputsForNode('node-target', nodes, edges);

    expect(inputs.get('inputPrompt')).toBe('prompt text');
    expect(inputs.get('inputImages')).toEqual(['image-a.png', 'image-b.png']);
  });
});

describe('getUpstreamNodeIds', () => {
  it('walks upstream dependencies without rescanning the full edge list', () => {
    const nodeIds = getUpstreamNodeIds(['node-target'], edges);

    expect(new Set(nodeIds)).toEqual(
      new Set(['node-target', 'prompt-1', 'image-1', 'image-2']),
    );
  });
});
