import type { WorkflowEdge, WorkflowNode } from '@genfeedai/types';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { applyEditOperations, type EditOperation } from './editOperations';

function makeNode(id: string, type = 'prompt'): WorkflowNode {
  return {
    data: { label: id, status: 'idle' },
    id,
    position: { x: 0, y: 0 },
    type,
  } as WorkflowNode;
}

function makeEdge(source: string, target: string, id = `${source}-${target}`) {
  return { id, source, target } as WorkflowEdge;
}

describe('applyEditOperations', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('adds nodes with deterministic ids, default positions, and merged data', () => {
    vi.spyOn(Date, 'now').mockReturnValue(1234);

    const result = applyEditOperations(
      [
        {
          data: { customPrompt: 'launch copy', label: 'Launch prompt' },
          nodeType: 'prompt',
          type: 'addNode',
        } as EditOperation,
      ],
      { edges: [], nodes: [] },
    );

    expect(result.applied).toBe(1);
    expect(result.skipped).toEqual([]);
    expect(result.nodes).toHaveLength(1);
    expect(result.nodes[0]).toMatchObject({
      data: expect.objectContaining({
        customPrompt: 'launch copy',
        label: 'Launch prompt',
      }),
      id: 'prompt-ai-1234-0',
      position: { x: 200, y: 200 },
      type: 'prompt',
    });
  });

  it('updates node data immutably and leaves other nodes untouched', () => {
    const sourceNodes = [makeNode('prompt-1'), makeNode('prompt-2', 'llm')];

    const result = applyEditOperations(
      [
        {
          data: { label: 'Updated prompt', status: 'complete' },
          nodeId: 'prompt-1',
          type: 'updateNode',
        },
      ],
      { edges: [], nodes: sourceNodes },
    );

    expect(result.applied).toBe(1);
    expect(result.nodes[0]).toMatchObject({
      data: { label: 'Updated prompt', status: 'complete' },
      id: 'prompt-1',
    });
    expect(result.nodes[1]).toBe(sourceNodes[1]);
    expect(sourceNodes[0].data).toEqual({ label: 'prompt-1', status: 'idle' });
  });

  it('removes a node and its connected edges', () => {
    const result = applyEditOperations(
      [{ nodeId: 'middle', type: 'removeNode' }],
      {
        edges: [
          makeEdge('start', 'middle'),
          makeEdge('middle', 'end'),
          makeEdge('start', 'end'),
        ],
        nodes: [makeNode('start'), makeNode('middle'), makeNode('end')],
      },
    );

    expect(result.applied).toBe(1);
    expect(result.nodes.map((node) => node.id)).toEqual(['start', 'end']);
    expect(result.edges).toEqual([makeEdge('start', 'end')]);
  });

  it('adds and removes edges when referenced nodes and edges exist', () => {
    const result = applyEditOperations(
      [
        {
          source: 'prompt',
          sourceHandle: 'output',
          target: 'image',
          targetHandle: 'input',
          type: 'addEdge',
        },
        { edgeId: 'existing-edge', type: 'removeEdge' },
      ],
      {
        edges: [makeEdge('old', 'prompt', 'existing-edge')],
        nodes: [makeNode('old'), makeNode('prompt'), makeNode('image')],
      },
    );

    expect(result.applied).toBe(2);
    expect(result.edges).toEqual([
      {
        id: 'edge-ai-prompt-image-output',
        source: 'prompt',
        sourceHandle: 'output',
        target: 'image',
        targetHandle: 'input',
      },
    ]);
  });

  it('skips invalid operations and keeps applying later valid operations', () => {
    const result = applyEditOperations(
      [
        { nodeId: 'missing', type: 'removeNode' },
        { data: { status: 'complete' }, nodeId: 'missing', type: 'updateNode' },
        { source: 'missing', target: 'prompt', type: 'addEdge' },
        { source: 'prompt', target: 'missing', type: 'addEdge' },
        { edgeId: 'missing-edge', type: 'removeEdge' },
        { data: { status: 'complete' }, nodeId: 'prompt', type: 'updateNode' },
      ],
      { edges: [], nodes: [makeNode('prompt')] },
    );

    expect(result.applied).toBe(1);
    expect(result.nodes[0].data).toMatchObject({ status: 'complete' });
    expect(result.skipped).toEqual([
      'removeNode: node "missing" not found',
      'updateNode: node "missing" not found',
      'addEdge: source node "missing" not found',
      'addEdge: target node "missing" not found',
      'removeEdge: edge "missing-edge" not found',
    ]);
  });
});
