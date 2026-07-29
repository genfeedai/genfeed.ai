'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
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
 *
 * `setPortalTarget` is identity-stable so layout nav-panel memos that only
 * need the setter do not recreate when the DOM node attaches.
 */
export function WorkspaceNavPanelProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [portalTarget, setPortalTargetState] = useState<HTMLElement | null>(
    null,
  );

  const setPortalTarget = useCallback((target: HTMLElement | null) => {
    setPortalTargetState((previous) =>
      previous === target ? previous : target,
    );
  }, []);

  const value = useMemo<WorkspaceNavPanelContextValue>(
    () => ({
      portalTarget,
      setPortalTarget,
    }),
    [portalTarget, setPortalTarget],
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
