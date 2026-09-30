import { beforeEach, describe, expect, it } from 'vitest';
import { useWorkflowStore } from '../workflowStore';

function addNode(): string {
  return useWorkflowStore.getState().addNode('imageGen', { x: 0, y: 0 });
}

beforeEach(() => {
  useWorkflowStore.setState({
    chatMessages: [],
    edges: [],
    groups: [],
    isChatOpen: false,
    isDirty: false,
    manualChangeCount: 0,
    nodes: [],
    previousWorkflowSnapshot: null,
    selectedNodeIds: [],
  });
});

describe('groupSlice', () => {
  it('createGroup returns an id and assigns a rotating color and name', () => {
    const nodeId = addNode();
    const groupId = useWorkflowStore.getState().createGroup([nodeId]);

    const group = useWorkflowStore.getState().getGroupById(groupId);
    expect(group).toBeDefined();
    expect(group?.color).toBe('purple');
    expect(group?.name).toBe('Group 1');
    expect(group?.isLocked).toBe(false);
    expect(useWorkflowStore.getState().isDirty).toBe(true);
  });

  it('createGroup with no nodes is a no-op', () => {
    expect(useWorkflowStore.getState().createGroup([])).toBe('');
    expect(useWorkflowStore.getState().groups).toHaveLength(0);
  });

  it('createGroup accepts a custom name', () => {
    const nodeId = addNode();
    const groupId = useWorkflowStore.getState().createGroup([nodeId], 'Mine');
    expect(useWorkflowStore.getState().getGroupById(groupId)?.name).toBe(
      'Mine',
    );
  });

  it('deleteGroup removes the group', () => {
    const nodeId = addNode();
    const groupId = useWorkflowStore.getState().createGroup([nodeId]);
    useWorkflowStore.getState().deleteGroup(groupId);
    expect(useWorkflowStore.getState().getGroupById(groupId)).toBeUndefined();
  });

  it('addToGroup merges without duplicates and removeFromGroup removes', () => {
    const a = addNode();
    const b = addNode();
    const groupId = useWorkflowStore.getState().createGroup([a]);

    useWorkflowStore.getState().addToGroup(groupId, [a, b]);
    expect(useWorkflowStore.getState().getGroupById(groupId)?.nodeIds).toEqual([
      a,
      b,
    ]);

    useWorkflowStore.getState().removeFromGroup(groupId, [a]);
    expect(useWorkflowStore.getState().getGroupById(groupId)?.nodeIds).toEqual([
      b,
    ]);
  });

  it('renameGroup and setGroupColor update the group', () => {
    const nodeId = addNode();
    const groupId = useWorkflowStore.getState().createGroup([nodeId]);

    useWorkflowStore.getState().renameGroup(groupId, 'Renamed');
    useWorkflowStore.getState().setGroupColor(groupId, 'green');

    const group = useWorkflowStore.getState().getGroupById(groupId);
    expect(group?.name).toBe('Renamed');
    expect(group?.color).toBe('green');
  });

  it('getGroupByNodeId finds the containing group', () => {
    const nodeId = addNode();
    const groupId = useWorkflowStore.getState().createGroup([nodeId]);

    expect(useWorkflowStore.getState().getGroupByNodeId(nodeId)?.id).toBe(
      groupId,
    );
    expect(
      useWorkflowStore.getState().getGroupByNodeId('missing'),
    ).toBeUndefined();
  });

  it('toggleGroupLock locks the group and its member nodes', () => {
    const nodeId = addNode();
    const groupId = useWorkflowStore.getState().createGroup([nodeId]);

    useWorkflowStore.getState().toggleGroupLock(groupId);
    expect(useWorkflowStore.getState().getGroupById(groupId)?.isLocked).toBe(
      true,
    );
    expect(useWorkflowStore.getState().isNodeLocked(nodeId)).toBe(true);

    useWorkflowStore.getState().toggleGroupLock(groupId);
    expect(useWorkflowStore.getState().getGroupById(groupId)?.isLocked).toBe(
      false,
    );
    expect(useWorkflowStore.getState().isNodeLocked(nodeId)).toBe(false);
  });

  it('toggleGroupLock on an unknown group is a no-op', () => {
    useWorkflowStore.getState().toggleGroupLock('missing');
    expect(useWorkflowStore.getState().groups).toHaveLength(0);
  });
});

describe('lockingSlice', () => {
  it('lockNode marks the node locked and not draggable', () => {
    const nodeId = addNode();
    useWorkflowStore.getState().lockNode(nodeId);

    const node = useWorkflowStore.getState().getNodeById(nodeId);
    expect(node?.data.isLocked).toBe(true);
    expect(node?.draggable).toBe(false);
    expect(useWorkflowStore.getState().isNodeLocked(nodeId)).toBe(true);
  });

  it('lockNode is idempotent for an already-locked node', () => {
    const nodeId = addNode();
    useWorkflowStore.getState().lockNode(nodeId);
    const timestamp = useWorkflowStore.getState().getNodeById(nodeId)
      ?.data.lockTimestamp;

    useWorkflowStore.getState().lockNode(nodeId);
    expect(
      useWorkflowStore.getState().getNodeById(nodeId)?.data.lockTimestamp,
    ).toBe(timestamp);
  });

  it('unlockNode restores draggable state', () => {
    const nodeId = addNode();
    useWorkflowStore.getState().lockNode(nodeId);
    useWorkflowStore.getState().unlockNode(nodeId);

    const node = useWorkflowStore.getState().getNodeById(nodeId);
    expect(node?.data.isLocked).toBe(false);
    expect(node?.draggable).toBe(true);
  });

  it('toggleNodeLock flips the lock state', () => {
    const nodeId = addNode();
    useWorkflowStore.getState().toggleNodeLock(nodeId);
    expect(useWorkflowStore.getState().isNodeLocked(nodeId)).toBe(true);
    useWorkflowStore.getState().toggleNodeLock(nodeId);
    expect(useWorkflowStore.getState().isNodeLocked(nodeId)).toBe(false);
  });

  it('toggleNodeLock on an unknown node is a no-op', () => {
    useWorkflowStore.getState().toggleNodeLock('missing');
    expect(useWorkflowStore.getState().isNodeLocked('missing')).toBe(false);
  });

  it('lockMultipleNodes and unlockMultipleNodes act on the given set', () => {
    const a = addNode();
    const b = addNode();
    const c = addNode();

    useWorkflowStore.getState().lockMultipleNodes([a, b]);
    expect(useWorkflowStore.getState().isNodeLocked(a)).toBe(true);
    expect(useWorkflowStore.getState().isNodeLocked(b)).toBe(true);
    expect(useWorkflowStore.getState().isNodeLocked(c)).toBe(false);

    useWorkflowStore.getState().unlockMultipleNodes([a]);
    expect(useWorkflowStore.getState().isNodeLocked(a)).toBe(false);
    expect(useWorkflowStore.getState().isNodeLocked(b)).toBe(true);
  });

  it('unlockAllNodes unlocks everything', () => {
    const a = addNode();
    const b = addNode();
    useWorkflowStore.getState().lockMultipleNodes([a, b]);
    useWorkflowStore.getState().unlockAllNodes();

    expect(useWorkflowStore.getState().isNodeLocked(a)).toBe(false);
    expect(useWorkflowStore.getState().isNodeLocked(b)).toBe(false);
  });
});

describe('selectionSlice', () => {
  it('setSelectedNodeIds replaces the selection', () => {
    useWorkflowStore.getState().setSelectedNodeIds(['a', 'b']);
    expect(useWorkflowStore.getState().selectedNodeIds).toEqual(['a', 'b']);
  });

  it('addToSelection is idempotent', () => {
    useWorkflowStore.getState().addToSelection('a');
    useWorkflowStore.getState().addToSelection('a');
    expect(useWorkflowStore.getState().selectedNodeIds).toEqual(['a']);
  });

  it('removeFromSelection removes only the given id', () => {
    useWorkflowStore.getState().setSelectedNodeIds(['a', 'b']);
    useWorkflowStore.getState().removeFromSelection('a');
    expect(useWorkflowStore.getState().selectedNodeIds).toEqual(['b']);
  });

  it('clearSelection empties the selection', () => {
    useWorkflowStore.getState().setSelectedNodeIds(['a']);
    useWorkflowStore.getState().clearSelection();
    expect(useWorkflowStore.getState().selectedNodeIds).toEqual([]);
  });
});

describe('chatSlice', () => {
  it('addChatMessage appends messages with unique ids', () => {
    useWorkflowStore.getState().addChatMessage('user', 'hello');
    useWorkflowStore.getState().addChatMessage('assistant', 'hi');

    const messages = useWorkflowStore.getState().chatMessages;
    expect(messages).toHaveLength(2);
    expect(messages[0].role).toBe('user');
    expect(messages[1].content).toBe('hi');
    expect(messages[0].id).not.toBe(messages[1].id);
  });

  it('clearChatMessages resets the transcript', () => {
    useWorkflowStore.getState().addChatMessage('user', 'hello');
    useWorkflowStore.getState().clearChatMessages();
    expect(useWorkflowStore.getState().chatMessages).toEqual([]);
  });

  it('setChatOpen and toggleChat control visibility', () => {
    useWorkflowStore.getState().setChatOpen(true);
    expect(useWorkflowStore.getState().isChatOpen).toBe(true);
    useWorkflowStore.getState().toggleChat();
    expect(useWorkflowStore.getState().isChatOpen).toBe(false);
  });

  it('applyChatEditOperations captures a snapshot first', () => {
    addNode();
    const result = useWorkflowStore.getState().applyChatEditOperations([]);

    expect(result).toEqual({ applied: 0, skipped: [] });
    expect(useWorkflowStore.getState().previousWorkflowSnapshot).not.toBeNull();
  });
});

describe('snapshotSlice', () => {
  it('captureSnapshot deep-copies the graph', () => {
    const nodeId = addNode();
    useWorkflowStore.getState().captureSnapshot();

    const snapshot = useWorkflowStore.getState().previousWorkflowSnapshot;
    expect(snapshot?.nodes).toHaveLength(1);
    expect(snapshot?.nodes[0].id).toBe(nodeId);
    expect(snapshot?.nodes[0]).not.toBe(useWorkflowStore.getState().nodes[0]);
  });

  it('revertToSnapshot restores the captured graph', () => {
    addNode();
    useWorkflowStore.getState().captureSnapshot();
    addNode();
    expect(useWorkflowStore.getState().nodes).toHaveLength(2);

    useWorkflowStore.getState().revertToSnapshot();
    expect(useWorkflowStore.getState().nodes).toHaveLength(1);
    expect(useWorkflowStore.getState().previousWorkflowSnapshot).toBeNull();
  });

  it('revertToSnapshot without a snapshot is a no-op', () => {
    addNode();
    useWorkflowStore.getState().revertToSnapshot();
    expect(useWorkflowStore.getState().nodes).toHaveLength(1);
  });

  it('clearSnapshot drops the snapshot', () => {
    addNode();
    useWorkflowStore.getState().captureSnapshot();
    useWorkflowStore.getState().clearSnapshot();
    expect(useWorkflowStore.getState().previousWorkflowSnapshot).toBeNull();
  });

  it('incrementManualChangeCount clears the snapshot after 3 changes', () => {
    addNode();
    useWorkflowStore.getState().captureSnapshot();

    useWorkflowStore.getState().incrementManualChangeCount();
    useWorkflowStore.getState().incrementManualChangeCount();
    expect(useWorkflowStore.getState().previousWorkflowSnapshot).not.toBeNull();

    useWorkflowStore.getState().incrementManualChangeCount();
    expect(useWorkflowStore.getState().previousWorkflowSnapshot).toBeNull();
    expect(useWorkflowStore.getState().manualChangeCount).toBe(0);
  });
});
