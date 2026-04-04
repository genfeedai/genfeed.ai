'use client';

import { GrowthBook, GrowthBookProvider } from '@growthbook/growthbook-react';
import { type ReactNode, useEffect, useMemo } from 'react';

export interface GrowthBookClientProviderProps {
  children: ReactNode;
  apiHost?: string;
  clientKey?: string;
  userId?: string;
  plan?: string;
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
  userId,
  plan,
}: GrowthBookClientProviderProps) {
  const gb = useMemo(() => {
    if (!apiHost || !clientKey) return null;

    return new GrowthBook({
      apiHost,
      attributes: {
        ...(userId ? { id: userId } : {}),
        ...(plan ? { plan } : {}),
      },
      clientKey,
      enableDevMode: process.env.NODE_ENV !== 'production',
    });
  }, [apiHost, clientKey, userId, plan]);

  useEffect(() => {
    if (!gb) return;

    gb.init({ streaming: true });

    return () => {
      gb.destroy();
    };
  }, [gb]);

  if (!gb) {
    return <>{children}</>;
  }

  return <GrowthBookProvider growthbook={gb}>{children}</GrowthBookProvider>;
}
