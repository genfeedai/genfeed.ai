'use client';

import {
  createContext,
  type ReactNode,
  useContext,
  useMemo,
  useState,
} from 'react';

type WorkspaceNavPanelContextValue = {
  readonly portalTarget: HTMLElement | null;
  readonly setPortalTarget: (target: HTMLElement | null) => void;
};

const WorkspaceNavPanelContext =
  createContext<WorkspaceNavPanelContextValue | null>(null);

/**
 * Shares the module-owned nav-column portal between the protected layout and
 * its routed surface. The sidebar is a sibling of the page canvas, so the
 * target has to live above both.
 */
export function WorkspaceNavPanelProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
  const value = useMemo(
    () => ({ portalTarget, setPortalTarget }),
    [portalTarget],
  );

  return (
    <WorkspaceNavPanelContext.Provider value={value}>
      {children}
    </WorkspaceNavPanelContext.Provider>
  );
}

export function useWorkspaceNavPanel(): WorkspaceNavPanelContextValue | null {
  return useContext(WorkspaceNavPanelContext);
}
