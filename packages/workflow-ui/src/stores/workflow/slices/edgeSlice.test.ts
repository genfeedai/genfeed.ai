import type { NodeChange } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkflowStore } from '../workflowStore';

describe('edgeSlice onNodesChange', () => {
  beforeEach(() => {
    useWorkflowStore.getState().clearWorkflow();
  });

  it('marks the workflow dirty when a node position changes', () => {
    const store = useWorkflowStore.getState();
    const nodeId = store.addNode('prompt', { x: 0, y: 0 });

    useWorkflowStore.getState().setDirty(false);

    const changes: NodeChange[] = [
      {
        dragging: false,
        id: nodeId,
        position: { x: 120, y: 180 },
        positionAbsolute: { x: 120, y: 180 },
        type: 'position',
      },
    ];

    useWorkflowStore.getState().onNodesChange(changes);

    const nextState = useWorkflowStore.getState();

    expect(nextState.isDirty).toBe(true);
    expect(
      nextState.nodes.find((node) => node.id === nodeId)?.position,
    ).toEqual({ x: 120, y: 180 });
  });
});
