'use client';

import { createContext, type ReactNode, useContext, useMemo } from 'react';

interface FeatureFlagContextValue {
  flags: Record<string, unknown>;
  isConfigured: boolean;
  isReady: boolean;
}

const FeatureFlagContext = createContext<FeatureFlagContextValue>({
  flags: {},
  isConfigured: false,
  isReady: true,
});

export interface FeatureFlagProviderProps {
  children: ReactNode;
  defaults?: Record<string, unknown>;
}

export function FeatureFlagProvider({
  children,
  defaults = parseFeatureFlagDefaults(
    process.env.NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS,
  ),
}: FeatureFlagProviderProps) {
  const isConfigured = Object.keys(defaults).length > 0;

  const value = useMemo<FeatureFlagContextValue>(
    () => ({
      flags: defaults,
      isConfigured,
      isReady: true,
    }),
    [defaults, isConfigured],
  );

  return (
    <FeatureFlagContext.Provider value={value}>
      {children}
    </FeatureFlagContext.Provider>
  );
}

export function useFeatureFlagContext(): FeatureFlagContextValue {
  return useContext(FeatureFlagContext);
}

function parseFeatureFlagDefaults(
  rawDefaults: string | undefined,
): Record<string, unknown> {
  if (!rawDefaults) {
    return {};
  }

  try {
    const parsed = JSON.parse(rawDefaults) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(
        'NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS must be a JSON object',
      );
    }

    return parsed as Record<string, unknown>;
  } catch {
    return {};
  }
}
