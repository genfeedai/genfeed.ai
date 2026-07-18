import type { EdgeChange, NodeChange } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useWorkflowStore } from '../workflowStore';

/**
 * Canonical dirty semantics for the workflow graph (issue #1151, step 4).
 *
 * The app fork's `onNodesChange` did NOT treat `position` changes as
 * dirty-relevant, so dragging a node never triggered the debounced auto-save and
 * node layout was silently lost on reload (`handleNodeDragStop` only resets a UI
 * flag; there is no other persistence path). The package treats `position` as
 * dirty — the correct behavior — so these tests lock it in before the fork is
 * deleted and its consumers adopt this slice (step 5).
 */
describe('edgeSlice onNodesChange dirty semantics', () => {
  beforeEach(() => {
    useWorkflowStore.getState().clearWorkflow();
  });

  function addNodeAndClean(): string {
    const nodeId = useWorkflowStore
      .getState()
      .addNode('prompt', { x: 0, y: 0 });
    useWorkflowStore.getState().setDirty(false);
    return nodeId;
  }

  it('marks dirty and moves the node on a position change', () => {
    const nodeId = addNodeAndClean();

    useWorkflowStore.getState().onNodesChange([
      {
        dragging: false,
        id: nodeId,
        position: { x: 120, y: 180 },
        positionAbsolute: { x: 120, y: 180 },
        type: 'position',
      } as NodeChange,
    ]);

    const nextState = useWorkflowStore.getState();
    expect(nextState.isDirty).toBe(true);
    expect(
      nextState.nodes.find((node) => node.id === nodeId)?.position,
    ).toEqual({ x: 120, y: 180 });
  });

  it('marks dirty on structural changes (remove, replace)', () => {
    const nodeId = addNodeAndClean();
    const node = useWorkflowStore
      .getState()
      .nodes.find((n) => n.id === nodeId) as NonNullable<
      ReturnType<typeof useWorkflowStore.getState>['nodes'][number]
    >;

    useWorkflowStore.getState().onNodesChange([{ id: nodeId, type: 'remove' }]);
    expect(useWorkflowStore.getState().isDirty).toBe(true);

    useWorkflowStore.getState().clearWorkflow();
    useWorkflowStore.getState().setDirty(false);
    useWorkflowStore
      .getState()
      .onNodesChange([{ item: node, type: 'add' } as NodeChange]);
    expect(useWorkflowStore.getState().isDirty).toBe(true);
  });

  it('does NOT mark dirty on cosmetic changes (select, dimensions)', () => {
    const nodeId = addNodeAndClean();

    useWorkflowStore
      .getState()
      .onNodesChange([{ id: nodeId, selected: true, type: 'select' }]);
    expect(useWorkflowStore.getState().isDirty).toBe(false);

    useWorkflowStore.getState().onNodesChange([
      {
        dimensions: { height: 42, width: 42 },
        id: nodeId,
        type: 'dimensions',
      } as NodeChange,
    ]);
    expect(useWorkflowStore.getState().isDirty).toBe(false);
  });
});

describe('edgeSlice onEdgesChange dirty semantics', () => {
  beforeEach(() => {
    useWorkflowStore.getState().clearWorkflow();
  });

  it('marks dirty on structural edge changes but not on selection', () => {
    useWorkflowStore.getState().setDirty(false);
    useWorkflowStore
      .getState()
      .onEdgesChange([{ id: 'edge-1', type: 'remove' }]);
    expect(useWorkflowStore.getState().isDirty).toBe(true);

    useWorkflowStore.getState().setDirty(false);
    useWorkflowStore
      .getState()
      .onEdgesChange([
        { id: 'edge-1', selected: true, type: 'select' } as EdgeChange,
      ]);
    expect(useWorkflowStore.getState().isDirty).toBe(false);
  });
});
