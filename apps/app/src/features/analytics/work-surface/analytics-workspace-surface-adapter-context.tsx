'use client';

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';

export interface AnalyticsWorkspaceSurfaceAdapterState {
  readonly composerContext?: ReactNode;
  readonly contextLabel: string;
  readonly inspectorContent: ReactNode;
  readonly key: string;
  readonly surfaceKey: 'analytics';
}

interface AnalyticsWorkspaceSurfaceAdapterContextValue {
  readonly adapter: AnalyticsWorkspaceSurfaceAdapterState | null;
  readonly registerAdapter: (
    adapter: AnalyticsWorkspaceSurfaceAdapterState,
  ) => void;
  readonly unregisterAdapter: (key: string) => void;
}

const AnalyticsWorkspaceSurfaceAdapterContext =
  createContext<AnalyticsWorkspaceSurfaceAdapterContextValue | null>(null);

export function AnalyticsWorkspaceSurfaceAdapterProvider({
  children,
}: {
  readonly children: ReactNode;
}) {
  const [adapter, setAdapter] =
    useState<AnalyticsWorkspaceSurfaceAdapterState | null>(null);
  const registerAdapter = useCallback(
    (nextAdapter: AnalyticsWorkspaceSurfaceAdapterState) => {
      setAdapter(nextAdapter);
    },
    [],
  );
  const unregisterAdapter = useCallback((key: string) => {
    setAdapter((current) => (current?.key === key ? null : current));
  }, []);
  const value = useMemo(
    () => ({ adapter, registerAdapter, unregisterAdapter }),
    [adapter, registerAdapter, unregisterAdapter],
  );

  return (
    <AnalyticsWorkspaceSurfaceAdapterContext.Provider value={value}>
      {children}
    </AnalyticsWorkspaceSurfaceAdapterContext.Provider>
  );
}

export function useActiveAnalyticsWorkspaceSurfaceAdapter(): AnalyticsWorkspaceSurfaceAdapterState | null {
  return useContext(AnalyticsWorkspaceSurfaceAdapterContext)?.adapter ?? null;
}

/** Registers Analytics-owned context only while its canonical route is mounted. */
export function useAnalyticsWorkspaceSurfaceAdapter(
  adapter: AnalyticsWorkspaceSurfaceAdapterState,
): void {
  const context = useContext(AnalyticsWorkspaceSurfaceAdapterContext);
  const registerAdapter = context?.registerAdapter;
  const unregisterAdapter = context?.unregisterAdapter;

  useLayoutEffect(() => {
    registerAdapter?.(adapter);
    return () => unregisterAdapter?.(adapter.key);
  }, [adapter, registerAdapter, unregisterAdapter]);
}
