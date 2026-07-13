'use client';

import type { WorkspaceShellOverlayRequest } from '@genfeedai/interfaces';
import { createContext, type ReactNode, useContext, useMemo } from 'react';

type WorkspaceShellActionsContextValue = {
  readonly openOverlay: (overlay: WorkspaceShellOverlayRequest) => boolean;
};

const WorkspaceShellActionsContext =
  createContext<WorkspaceShellActionsContextValue | null>(null);

export function WorkspaceShellActionsProvider({
  children,
  openOverlay,
}: {
  readonly children: ReactNode;
  readonly openOverlay: WorkspaceShellActionsContextValue['openOverlay'];
}) {
  const value = useMemo(() => ({ openOverlay }), [openOverlay]);
  return (
    <WorkspaceShellActionsContext.Provider value={value}>
      {children}
    </WorkspaceShellActionsContext.Provider>
  );
}

export function useWorkspaceShellActions(): WorkspaceShellActionsContextValue | null {
  return useContext(WorkspaceShellActionsContext);
}
