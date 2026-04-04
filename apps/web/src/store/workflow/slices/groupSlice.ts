import type { StateCreator } from 'zustand';
import type { GroupColor, NodeGroup } from '@/types/groups';
import { DEFAULT_GROUP_COLORS } from '@/types/groups';
import { generateId } from '../helpers/nodeHelpers';
import type { WorkflowStore } from '../types';

export interface GroupSlice {
  createGroup: (nodeIds: string[], name?: string) => string;
  deleteGroup: (groupId: string) => void;
  addToGroup: (groupId: string, nodeIds: string[]) => void;
  removeFromGroup: (groupId: string, nodeIds: string[]) => void;
  toggleGroupLock: (groupId: string) => void;
  renameGroup: (groupId: string, name: string) => void;
  setGroupColor: (groupId: string, color: GroupColor) => void;
  getGroupByNodeId: (nodeId: string) => NodeGroup | undefined;
  getGroupById: (groupId: string) => NodeGroup | undefined;
}

export const createGroupSlice: StateCreator<WorkflowStore, [], [], GroupSlice> = (set, get) => ({
  addToGroup: (groupId, nodeIds) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, nodeIds: [...new Set([...g.nodeIds, ...nodeIds])] } : g
      ),
      isDirty: true,
    }));
  },
  createGroup: (nodeIds, name) => {
    if (nodeIds.length === 0) return '';

    const groupId = generateId();
    const { groups } = get();
    const colorIndex = groups.length % DEFAULT_GROUP_COLORS.length;

    const newGroup: NodeGroup = {
      color: DEFAULT_GROUP_COLORS[colorIndex],
      id: groupId,
      isLocked: false,
      name: name ?? `Group ${groups.length + 1}`,
      nodeIds,
    };

    set((state) => ({
      groups: [...state.groups, newGroup],
      isDirty: true,
    }));

    return groupId;
  },

  deleteGroup: (groupId) => {
    set((state) => ({
      groups: state.groups.filter((g) => g.id !== groupId),
      isDirty: true,
    }));
  },

  getGroupById: (groupId) => {
    return get().groups.find((g) => g.id === groupId);
  },

  getGroupByNodeId: (nodeId) => {
    return get().groups.find((g) => g.nodeIds.includes(nodeId));
  },

  removeFromGroup: (groupId, nodeIds) => {
    set((state) => ({
      groups: state.groups.map((g) =>
        g.id === groupId ? { ...g, nodeIds: g.nodeIds.filter((id) => !nodeIds.includes(id)) } : g
      ),
      isDirty: true,
    }));
  },

  renameGroup: (groupId, name) => {
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, name } : g)),
      isDirty: true,
    }));
  },

  setGroupColor: (groupId, color) => {
    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, color } : g)),
      isDirty: true,
    }));
  },

  toggleGroupLock: (groupId) => {
    const { groups, lockMultipleNodes, unlockMultipleNodes } = get();
    const group = groups.find((g) => g.id === groupId);
    if (!group) return;

    set((state) => ({
      groups: state.groups.map((g) => (g.id === groupId ? { ...g, isLocked: !g.isLocked } : g)),
      isDirty: true,
    }));

    if (!group.isLocked) {
      lockMultipleNodes(group.nodeIds);
    } else {
      unlockMultipleNodes(group.nodeIds);
    }
  },
});
