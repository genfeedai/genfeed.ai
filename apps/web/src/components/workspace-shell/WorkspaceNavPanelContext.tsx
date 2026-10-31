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
  readonly portalTargets: readonly HTMLElement[];
  readonly registerPortalTarget: (target: HTMLElement) => () => void;
};

const WorkspaceNavPanelContext =
  createContext<WorkspaceNavPanelContextValue | null>(null);

/**
 * Shares the module-owned nav-column portal between the protected layout and
 * its routed surface. The sidebar is a sibling of the page canvas, so the
 * target has to live above both.
 *
 * Desktop and mobile shells mount separate targets. Track both so a hidden
 * mobile target cannot steal the visible desktop conversation list.
 */
export function WorkspaceNavPanelProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [portalTargets, setPortalTargets] = useState<HTMLElement[]>([]);
  const registerPortalTarget = useCallback((target: HTMLElement) => {
    setPortalTargets((previous) =>
      previous.includes(target) ? previous : [...previous, target],
    );
    return () =>
      setPortalTargets((previous) =>
        previous.filter((entry) => entry !== target),
      );
  }, []);
  const value = useMemo(
    () => ({ portalTargets, registerPortalTarget }),
    [portalTargets, registerPortalTarget],
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

export function WorkspaceNavPanelTarget() {
  const register = useWorkspaceNavPanel()?.registerPortalTarget;
  const ref = useCallback(
    (target: HTMLDivElement | null) => {
      if (target && register) return register(target);
    },
    [register],
  );
  return (
    <div
      className="flex h-full min-h-0 flex-col"
      data-testid="messages-nav-panel"
      ref={ref}
    />
  );
}
