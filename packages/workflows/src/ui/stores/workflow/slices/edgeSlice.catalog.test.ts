import type { WorkflowNode } from '@genfeedai/contracts/types';
import type { Connection } from '@xyflow/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkflowStore } from '../workflowStore';

function actionNode(id: string, actionId: string): WorkflowNode {
  return {
    data: { actionId, label: actionId, parameters: {}, status: 'idle' },
    id,
    position: { x: 0, y: 0 },
    type: 'genfeedAction',
  } as WorkflowNode;
}

function connect(
  source: string,
  target: string,
  sourceHandle = 'id',
  targetHandle = 'projectId',
): Connection {
  return { source, sourceHandle, target, targetHandle };
}

beforeEach(() => {
  useWorkflowStore.setState({
    edgeStyle: 'default',
    edges: [],
    isDirty: false,
    nodes: [
      actionNode('render', 'remotion.composition.render'),
      actionNode('status', 'remotion.composition.status'),
      actionNode('retry', 'remotion.composition.retry'),
      actionNode('prompt', 'promptConstructor'),
      {
        data: { label: 'Keyword Trigger', status: 'idle' },
        id: 'trigger',
        position: { x: 0, y: 0 },
        type: 'keywordTrigger',
      } as WorkflowNode,
    ],
  });
});

describe('catalog action connections', () => {
  it('connects the action-specific output and input displayed on the nodes', () => {
    const connection = connect('render', 'status');
    expect(useWorkflowStore.getState().isValidConnection(connection)).toBe(
      true,
    );
    useWorkflowStore.getState().onConnect(connection);
    expect(useWorkflowStore.getState().edges).toEqual([
      expect.objectContaining(connection),
    ]);
    expect(useWorkflowStore.getState().isDirty).toBe(true);
  });

  it('connects registered trigger outputs to action inputs', () => {
    expect(
      useWorkflowStore
        .getState()
        .isValidConnection(connect('trigger', 'render', 'text', 'title')),
    ).toBe(true);
  });

  it('rejects mismatched media types and handles not displayed by the action', () => {
    const state = useWorkflowStore.getState();
    expect(
      state.isValidConnection(connect('render', 'retry', 'progress')),
    ).toBe(false);
    expect(state.isValidConnection(connect('render', 'retry', 'missing'))).toBe(
      false,
    );
    expect(
      state.isValidConnection(connect('render', 'retry', 'output', 'input')),
    ).toBe(false);
  });

  it('finds the same compatible action input when dropping onto the node body', () => {
    expect(
      useWorkflowStore
        .getState()
        .findCompatibleHandle('render', 'id', 'status'),
    ).toBe('projectId');
  });

  it('prevents duplicate edges and replacing an occupied single input', () => {
    const connection = connect('render', 'status');
    useWorkflowStore.getState().onConnect(connection);
    expect(useWorkflowStore.getState().isValidConnection(connection)).toBe(
      false,
    );
    expect(
      useWorkflowStore.getState().isValidConnection(connect('retry', 'status')),
    ).toBe(false);
    expect(
      useWorkflowStore.getState().findCompatibleHandle('retry', 'id', 'status'),
    ).toBeNull();
    useWorkflowStore.getState().onConnect(connection);
    expect(useWorkflowStore.getState().edges).toHaveLength(1);
  });

  it('allows multiple distinct sources on an array input', () => {
    useWorkflowStore
      .getState()
      .onConnect(connect('status', 'prompt', 'id', 'hooks'));
    expect(
      useWorkflowStore
        .getState()
        .isValidConnection(connect('retry', 'prompt', 'id', 'hooks')),
    ).toBe(true);
  });

  it('rejects self connections and cycles without preventing independent branches', () => {
    expect(
      useWorkflowStore
        .getState()
        .isValidConnection(connect('status', 'status')),
    ).toBe(false);
    useWorkflowStore.getState().onConnect(connect('render', 'status'));
    useWorkflowStore.getState().onConnect(connect('status', 'retry'));
    expect(
      useWorkflowStore
        .getState()
        .isValidConnection(connect('retry', 'render', 'id', 'title')),
    ).toBe(false);
    expect(
      useWorkflowStore.getState().findCompatibleHandle('retry', 'id', 'render'),
    ).toBeNull();
    expect(
      useWorkflowStore
        .getState()
        .isValidConnection(connect('trigger', 'render', 'text', 'title')),
    ).toBe(true);
  });
});
