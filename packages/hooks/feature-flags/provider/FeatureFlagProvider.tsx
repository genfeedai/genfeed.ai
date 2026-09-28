'use client';

import { createContext, type ReactNode, use, useMemo } from 'react';

interface FeatureFlagContextValue {
  flags: Record<string, unknown>;
  isConfigured: boolean;
  isReady: boolean;
}

interface ParsedFeatureFlagDefaults {
  flags: Record<string, unknown>;
  isConfigured: boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  flags: {},
  isConfigured: false,
  isReady: true,
});

export interface FeatureFlagProviderProps {
  children: ReactNode;
  defaults?: Record<string, unknown>;
  fallbacks?: Record<string, unknown>;
  overrides?: Record<string, unknown>;
  ready?: boolean;
}

export function FeatureFlagProvider({
  children,
  defaults,
  fallbacks,
  overrides,
  ready = true,
}: FeatureFlagProviderProps) {
  // Flag values come from the Admin platform flags (#5468);
  // there is no env JSON of flag values.
  const resolvedDefaults = useMemo<ParsedFeatureFlagDefaults>(
    () => ({
      flags: defaults ?? {},
      isConfigured: Object.keys(defaults ?? {}).length > 0,
    }),
    [defaults],
  );

  const value = useMemo<FeatureFlagContextValue>(
    () => ({
      flags: { ...fallbacks, ...resolvedDefaults.flags, ...overrides },
      // Server-resolved overrides are independent from public defaults.
      isConfigured: resolvedDefaults.isConfigured,
      isReady: ready,
    }),
    [fallbacks, overrides, ready, resolvedDefaults],
  );

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlagContext(): FeatureFlagContextValue {
  return use(FeatureFlagContext);
}
