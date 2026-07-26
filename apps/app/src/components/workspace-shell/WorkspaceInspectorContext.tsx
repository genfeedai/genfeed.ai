'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

type WorkspaceInspectorContextValue = {
  readonly isOpen: boolean;
  readonly isRegistered: boolean;
  readonly registerInspector: () => () => void;
  readonly setIsOpen: (isOpen: boolean) => void;
  readonly toggle: () => void;
};

const WorkspaceInspectorContext =
  createContext<WorkspaceInspectorContextValue | null>(null);

/**
 * The inspector rail lives inside `UniversalWorkspaceShell`, but its collapse
 * toggle has to render in the topbar — and the topbar is passed to `AppLayout`
 * as a sibling of the shell, not a descendant. This provider sits above both so
 * the two can share one piece of state.
 */
export function WorkspaceInspectorProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [isOpen, setIsOpen] = useState(true);
  const [registeredCount, setRegisteredCount] = useState(0);

  const registerInspector = useCallback(() => {
    setRegisteredCount((count) => count + 1);

    return () => {
      setRegisteredCount((count) => Math.max(0, count - 1));
    };
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((open) => !open);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      isRegistered: registeredCount > 0,
      registerInspector,
      setIsOpen,
      toggle,
    }),
    [isOpen, registerInspector, registeredCount, toggle],
  );

  return (
    <WorkspaceInspectorContext.Provider value={value}>
      {children}
    </WorkspaceInspectorContext.Provider>
  );
}

/**
 * Returns `null` when no provider is mounted — the shell is rendered standalone
 * in tests and in non-protected layouts, and must keep working there on local
 * state.
 */
export function useWorkspaceInspector(): WorkspaceInspectorContextValue | null {
  return useContext(WorkspaceInspectorContext);
}

/** Marks an inspector rail as mounted so the topbar knows to show its toggle. */
export function useRegisterWorkspaceInspector(): void {
  const inspector = useWorkspaceInspector();
  const registerInspector = inspector?.registerInspector;

  useEffect(() => {
    if (!registerInspector) {
      return;
    }

    return registerInspector();
  }, [registerInspector]);
}
