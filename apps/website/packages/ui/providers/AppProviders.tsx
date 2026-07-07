'use client';

import { BetterAuthProvider } from '@genfeedai/auth-client/react';
import { dark } from '@genfeedai/auth-client/themes';
import { THEME_STORAGE_KEY } from '@genfeedai/constants';
import ThemeCookieSync from '@ui/providers/ThemeCookieSync';
import dynamic from 'next/dynamic';
import { ThemeProvider, useTheme } from 'next-themes';
import type { ReactNode } from 'react';
import { useMemo } from 'react';
import { Toaster } from 'sonner';
import MarketingTrackingProvider from '../../marketing/MarketingTrackingProvider';
import type { MarketingRetargetingProviderConfig } from '../../marketing/retargeting';

const LazyModalErrorDebug = dynamic(
  () => import('@ui/modals/system/error-debug/ModalErrorDebug'),
  { ssr: false },
);

interface BetterAuthProviderProps {
  appearance?: {
    theme?: unknown;
    [key: string]: unknown;
  };
  [key: string]: unknown;
}

export interface AppProvidersProps {
  children: ReactNode;
  initialTheme: string;
  authProps?: BetterAuthProviderProps;
  disableTransitionOnChange?: boolean;
  enableSystem?: boolean;
  includeLazyModalErrorDebug?: boolean;
  includeMarketingTracking?: boolean;
  includeToaster?: boolean;
  marketingConsentDefault?: 'denied' | 'granted';
  marketingGtmContainerId?: string;
  marketingRetargetingProviders?: MarketingRetargetingProviderConfig[];
  storageKey?: string;
}

function ThemedBetterAuthProvider({
  children,
  authProps,
}: {
  children: ReactNode;
  authProps?: BetterAuthProviderProps;
}) {
  const { resolvedTheme } = useTheme();
  const appearance = authProps?.appearance;

  return (
    <BetterAuthProvider
      {...authProps}
      appearance={{
        ...(appearance ?? {}),
        theme: resolvedTheme === 'dark' ? dark : appearance?.theme,
      }}
    >
      {children}
    </BetterAuthProvider>
  );
}

export default function AppProviders({
  children,
  initialTheme,
  authProps,
  disableTransitionOnChange = true,
  enableSystem = false,
  includeLazyModalErrorDebug = true,
  includeMarketingTracking = true,
  includeToaster = true,
  marketingConsentDefault = 'denied',
  marketingGtmContainerId,
  marketingRetargetingProviders = [],
  storageKey = THEME_STORAGE_KEY,
}: AppProvidersProps) {
  const marketingConfig = useMemo(
    () => ({
      gtmContainerId: marketingGtmContainerId,
      retargetingProviders: marketingRetargetingProviders,
    }),
    [marketingGtmContainerId, marketingRetargetingProviders],
  );
  const content = (
    <>
      <ThemeCookieSync />
      {children}
      {includeToaster ? (
        <Toaster richColors closeButton position="top-right" />
      ) : null}
      {includeLazyModalErrorDebug ? <LazyModalErrorDebug /> : null}
    </>
  );

  return (
    <ThemeProvider
      attribute="data-theme"
      enableSystem={enableSystem}
      defaultTheme={initialTheme}
      storageKey={storageKey}
      disableTransitionOnChange={disableTransitionOnChange}
    >
      <ThemedBetterAuthProvider authProps={authProps}>
        {includeMarketingTracking ? (
          <MarketingTrackingProvider
            config={marketingConfig}
            consentDefault={marketingConsentDefault}
          >
            {content}
          </MarketingTrackingProvider>
        ) : (
          content
        )}
      </ThemedBetterAuthProvider>
    </ThemeProvider>
  );
}
