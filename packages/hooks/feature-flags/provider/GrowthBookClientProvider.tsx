'use client';

import {
  type FeatureDefinition,
  GrowthBook,
  GrowthBookProvider,
} from '@growthbook/growthbook-react';
import {
  createContext,
  type ReactNode,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

interface GrowthBookClientStatus {
  isConfigured: boolean;
  isReady: boolean;
}

const GrowthBookClientStatusContext = createContext<GrowthBookClientStatus>({
  isConfigured: false,
  isReady: true,
});

export interface GrowthBookClientProviderProps {
  children: ReactNode;
  apiHost?: string;
  clientKey?: string;
  defaults?: Record<string, unknown>;
  organizationId?: string;
  plan?: string;
  userId?: string;
}

/**
 * Initializes the GrowthBook SDK and provides feature flag context.
 *
 * Reads config from `NEXT_PUBLIC_GROWTHBOOK_API_HOST` and
 * `NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY` env vars by default, with
 * optional prop overrides.
 *
 * Place this inside your app's client provider tree so that
 * `useFeatureFlag` / `useFeatureValue` work anywhere below it.
 */
export function GrowthBookClientProvider({
  children,
  apiHost = process.env.NEXT_PUBLIC_GROWTHBOOK_API_HOST ?? '',
  clientKey = process.env.NEXT_PUBLIC_GROWTHBOOK_CLIENT_KEY ?? '',
  defaults = parseFeatureFlagDefaults(
    process.env.NEXT_PUBLIC_FEATURE_FLAG_DEFAULTS,
  ),
  organizationId,
  plan,
  userId,
}: GrowthBookClientProviderProps) {
  const [isReady, setIsReady] = useState(false);
  const hasDefaults = Object.keys(defaults).length > 0;
  const hasRemoteConfig = Boolean(apiHost && clientKey);
  const isConfigured = hasRemoteConfig || hasDefaults;

  const gb = useMemo(() => {
    if (!hasRemoteConfig && !hasDefaults) return null;

    const instance = new GrowthBook({
      ...(apiHost ? { apiHost } : {}),
      attributes: {
        ...(userId ? { id: userId } : {}),
        ...(organizationId ? { organizationId } : {}),
        ...(plan ? { plan } : {}),
      },
      ...(clientKey ? { clientKey } : {}),
      enableDevMode: process.env.NODE_ENV !== 'production',
    });

    if (hasDefaults) {
      instance.setFeatures(toGrowthBookFeatures(defaults));
    }

    return instance;
  }, [
    apiHost,
    clientKey,
    defaults,
    hasDefaults,
    hasRemoteConfig,
    userId,
    organizationId,
    plan,
  ]);

  useEffect(() => {
    if (!gb) {
      setIsReady(true);
      return;
    }

    if (!hasRemoteConfig) {
      setIsReady(true);
      return () => {
        gb.destroy();
      };
    }

    let isMounted = true;
    setIsReady(false);

    void gb
      .init({ streaming: true })
      .catch(() => undefined)
      .finally(() => {
        if (isMounted) {
          setIsReady(true);
        }
      });

    return () => {
      isMounted = false;
      gb.destroy();
    };
  }, [gb, hasRemoteConfig]);

  if (!gb) {
    return (
      <GrowthBookClientStatusContext.Provider
        value={{ isConfigured, isReady: true }}
      >
        {children}
      </GrowthBookClientStatusContext.Provider>
    );
  }

  return (
    <GrowthBookClientStatusContext.Provider value={{ isConfigured, isReady }}>
      <GrowthBookProvider growthbook={gb}>{children}</GrowthBookProvider>
    </GrowthBookClientStatusContext.Provider>
  );
}

export function useGrowthBookClientStatus(): GrowthBookClientStatus {
  return useContext(GrowthBookClientStatusContext);
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

function toGrowthBookFeatures(
  defaults: Record<string, unknown>,
): Record<string, FeatureDefinition> {
  return Object.fromEntries(
    Object.entries(defaults).map(([key, value]) => [
      key,
      { defaultValue: value },
    ]),
  );
}
