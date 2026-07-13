'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
} from 'react';

export interface WorkspaceSurfaceAdapter {
  readonly contextLabel: string;
  readonly inspector: ReactNode;
  readonly surfaceKey: string;
}

interface WorkspaceSurfaceAdapterContextValue {
  readonly register: (adapter: WorkspaceSurfaceAdapter) => () => void;
}

interface WorkspaceSurfaceAdapterProviderProps {
  readonly activeSurfaceKey: string;
  readonly children: ReactNode;
  readonly onAdapterChange: (adapter: WorkspaceSurfaceAdapter | null) => void;
}

const WorkspaceSurfaceAdapterContext =
  createContext<WorkspaceSurfaceAdapterContextValue | null>(null);

export function WorkspaceSurfaceAdapterProvider({
  activeSurfaceKey,
  children,
  onAdapterChange,
}: WorkspaceSurfaceAdapterProviderProps) {
  const register = useCallback(
    (adapter: WorkspaceSurfaceAdapter) => {
      if (adapter.surfaceKey !== activeSurfaceKey) {
        return () => undefined;
      }

      onAdapterChange(adapter);
      return () => onAdapterChange(null);
    },
    [activeSurfaceKey, onAdapterChange],
  );
  const value = useMemo(() => ({ register }), [register]);

  return (
    <WorkspaceSurfaceAdapterContext.Provider value={value}>
      {children}
    </WorkspaceSurfaceAdapterContext.Provider>
  );
}

export function useWorkspaceSurfaceAdapter(
  adapter: WorkspaceSurfaceAdapter,
): void {
  const context = useContext(WorkspaceSurfaceAdapterContext);

  useEffect(() => {
    if (!context) {
      return;
    }

    return context.register(adapter);
  }, [adapter, context]);
}
