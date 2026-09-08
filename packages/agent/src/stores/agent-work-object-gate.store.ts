import type { AgentWorkObject } from '@genfeedai/contracts/interfaces';
import { create } from 'zustand';

interface WorkObjectGateState {
  threads: Record<string, { blocked: boolean; dirtyIds: string[] }>;
  setObjects: (threadId: string, objects: AgentWorkObject[] | null) => void;
  setDirty: (threadId: string, objectId: string, dirty: boolean) => void;
}

export const useAgentWorkObjectGateStore = create<WorkObjectGateState>(
  (set) => ({
    threads: {},
    setObjects: (threadId, objects) =>
      set((state) => ({
        threads: {
          ...state.threads,
          [threadId]: {
            blocked:
              objects === null ||
              objects.some(
                (object) =>
                  object.reviewStatus !== 'passed' &&
                  object.reviewStatus !== 'skipped',
              ),
            dirtyIds: state.threads[threadId]?.dirtyIds ?? [],
          },
        },
      })),
    setDirty: (threadId, objectId, dirty) =>
      set((state) => {
        const current = state.threads[threadId] ?? {
          blocked: true,
          dirtyIds: [],
        };
        const dirtyIds = current.dirtyIds.filter((id) => id !== objectId);
        if (dirty) dirtyIds.push(objectId);
        return {
          threads: { ...state.threads, [threadId]: { ...current, dirtyIds } },
        };
      }),
  }),
);

export function isWorkObjectGenerationBlocked(
  threadId: string | null,
  state: WorkObjectGateState,
): boolean {
  if (!threadId) return false;
  const gate = state.threads[threadId];
  return Boolean(gate && (gate.blocked || gate.dirtyIds.length));
}
