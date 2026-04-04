import type { StateCreator } from 'zustand';
import { getNodeOutput } from '../helpers/propagation';
import type { WorkflowStore } from '../types';

export interface LockingSlice {
  _setNodeLockState: (predicate: (nodeId: string) => boolean, lock: boolean) => void;
  toggleNodeLock: (nodeId: string) => void;
  lockNode: (nodeId: string) => void;
  unlockNode: (nodeId: string) => void;
  lockMultipleNodes: (nodeIds: string[]) => void;
  unlockMultipleNodes: (nodeIds: string[]) => void;
  unlockAllNodes: () => void;
  isNodeLocked: (nodeId: string) => boolean;
}

export const createLockingSlice: StateCreator<WorkflowStore, [], [], LockingSlice> = (
  set,
  get
) => ({
  _setNodeLockState: (predicate, lock) => {
    set((state) => ({
      isDirty: true,
      nodes: state.nodes.map((n) =>
        predicate(n.id)
          ? {
              ...n,
              data: {
                ...n.data,
                isLocked: lock,
                lockTimestamp: lock ? Date.now() : undefined,
                ...(lock && { cachedOutput: getNodeOutput(n) }),
              },
              draggable: !lock,
            }
          : n
      ),
    }));
  },

  isNodeLocked: (nodeId) => {
    const { nodes, groups } = get();
    const node = nodes.find((n) => n.id === nodeId);
    if (!node) return false;

    if (node.data.isLocked) return true;

    return groups.some((group) => group.isLocked && group.nodeIds.includes(nodeId));
  },

  lockMultipleNodes: (nodeIds) => {
    get()._setNodeLockState((id) => nodeIds.includes(id), true);
  },

  lockNode: (nodeId) => {
    const node = get().getNodeById(nodeId);
    if (!node || node.data.isLocked) return;
    get()._setNodeLockState((id) => id === nodeId, true);
  },

  toggleNodeLock: (nodeId) => {
    const node = get().getNodeById(nodeId);
    if (!node) return;
    const shouldLock = !(node.data.isLocked ?? false);
    get()._setNodeLockState((id) => id === nodeId, shouldLock);
  },

  unlockAllNodes: () => {
    get()._setNodeLockState(() => true, false);
  },

  unlockMultipleNodes: (nodeIds) => {
    get()._setNodeLockState((id) => nodeIds.includes(id), false);
  },

  unlockNode: (nodeId) => {
    get()._setNodeLockState((id) => id === nodeId, false);
  },
});
