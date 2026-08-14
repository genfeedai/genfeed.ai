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

/** Device-local chrome preference — same tier as main nav collapse. */
export const WORKSPACE_INSPECTOR_OPEN_STORAGE_KEY =
  'genfeed:workspace-inspector:open';

const DEFAULT_INSPECTOR_OPEN = true;

function readPersistedInspectorOpen(): boolean | null {
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const stored = window.localStorage.getItem(
      WORKSPACE_INSPECTOR_OPEN_STORAGE_KEY,
    );
    if (stored === 'true') {
      return true;
    }
    if (stored === 'false') {
      return false;
    }
    return null;
  } catch {
    return null;
  }
}

function persistInspectorOpen(nextValue: boolean): void {
  if (typeof window === 'undefined') {
    return;
  }

  try {
    window.localStorage.setItem(
      WORKSPACE_INSPECTOR_OPEN_STORAGE_KEY,
      String(nextValue),
    );
  } catch {
    // Private mode / quota — chrome still works in-session.
  }
}

/**
 * The inspector rail lives inside `UniversalWorkspaceShell`, but its collapse
 * toggle has to render in the topbar — and the topbar is passed to `AppLayout`
 * as a sibling of the shell, not a descendant. This provider sits above both so
 * the two can share one piece of state.
 *
 * Open/closed is a **device-local chrome preference** (localStorage), not a
 * server user setting. Matches main sidebar collapse and agent panel height.
 */
export function WorkspaceInspectorProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [isOpen, setIsOpenState] = useState(DEFAULT_INSPECTOR_OPEN);
  const [isPreferenceLoaded, setIsPreferenceLoaded] = useState(false);
  const [registeredCount, setRegisteredCount] = useState(0);

  useEffect(() => {
    const persisted = readPersistedInspectorOpen();
    if (persisted !== null) {
      setIsOpenState(persisted);
    }
    setIsPreferenceLoaded(true);
  }, []);

  useEffect(() => {
    if (!isPreferenceLoaded) {
      return;
    }

    persistInspectorOpen(isOpen);
  }, [isOpen, isPreferenceLoaded]);

  const setIsOpen = useCallback((nextOpen: boolean) => {
    setIsOpenState(nextOpen);
  }, []);

  const registerInspector = useCallback(() => {
    setRegisteredCount((count) => count + 1);

    return () => {
      setRegisteredCount((count) => Math.max(0, count - 1));
    };
  }, []);

  const toggle = useCallback(() => {
    setIsOpenState((open) => !open);
  }, []);

  const value = useMemo(
    () => ({
      isOpen,
      isRegistered: registeredCount > 0,
      registerInspector,
      setIsOpen,
      toggle,
    }),
    [isOpen, registerInspector, registeredCount, setIsOpen, toggle],
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
export function useRegisterWorkspaceInspector(isEnabled = true): void {
  const inspector = useWorkspaceInspector();
  const registerInspector = inspector?.registerInspector;

  useEffect(() => {
    if (!isEnabled || !registerInspector) {
      return;
    }

    return registerInspector();
  }, [isEnabled, registerInspector]);
}
