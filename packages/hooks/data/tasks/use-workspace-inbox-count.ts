'use client';

import { useWorkspaceInboxRead } from '@hooks/data/tasks/use-workspace-inbox-read';

/** The same recipient-scoped read state drives rows, menu and rail. */
export function useWorkspaceInboxCount(): number {
  const { state } = useWorkspaceInboxRead();
  return state.data?.unreadCount ?? 0;
}
