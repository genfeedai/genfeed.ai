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
  overrides?: Record<string, unknown>;
  ready?: boolean;
}

export function FeatureFlagProvider({
  children,
  defaults,
  overrides,
  ready = true,
}: FeatureFlagProviderProps) {
  const resolvedDefaults = useMemo<ParsedFeatureFlagDefaults>(
    () =>
      defaults === undefined
        ? parseFeatureFlagDefaults(
            process.env.NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS,
          )
        : {
            flags: defaults,
            isConfigured: Object.keys(defaults).length > 0,
          },
    [defaults],
  );

  const value = useMemo<FeatureFlagContextValue>(
    () => ({
      flags: { ...resolvedDefaults.flags, ...overrides },
      // Server-resolved overrides are independent from public defaults. In
      // particular, the conversation shell rollout must not make unrelated
      // OSS feature flags fail closed when no public defaults are configured.
      isConfigured: resolvedDefaults.isConfigured,
      isReady: ready,
    }),
    [overrides, ready, resolvedDefaults],
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

function parseFeatureFlagDefaults(
  rawDefaults: string | undefined,
): ParsedFeatureFlagDefaults {
  if (!rawDefaults) {
    return { flags: {}, isConfigured: false };
  }

  try {
    const parsed = JSON.parse(rawDefaults) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error(
        'NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS must be a JSON object',
      );
    }

    return {
      flags: parsed as Record<string, unknown>,
      isConfigured: true,
    };
  } catch {
    return { flags: {}, isConfigured: true };
  }
}
