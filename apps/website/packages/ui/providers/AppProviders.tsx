'use client';

import { BetterAuthProvider } from '@genfeedai/auth-client/react';
import { dark } from '@genfeedai/auth-client/themes';
import { THEME_STORAGE_KEY } from '@genfeedai/constants';
import ThemeCookieSync from '@ui/providers/ThemeCookieSync';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import dynamic from 'next/dynamic';
import { ThemeProvider, useTheme } from 'next-themes';
import type { ComponentProps, ReactNode } from 'react';
import { useMemo } from 'react';
import { Toaster } from 'sonner';
import type { MarketingTrackingConfig } from '../../marketing/browser';
import MarketingTrackingProvider from '../../marketing/MarketingTrackingProvider';

const LazyModalErrorDebug = dynamic(
  () => import('@ui/modals/system/error-debug/ModalErrorDebug'),
  { ssr: false },
);

type BetterAuthProviderProps = Omit<
  ComponentProps<typeof BetterAuthProvider>,
  'children'
>;

export interface AppProvidersProps {
  children: ReactNode;
  initialTheme: string;
  authProps?: BetterAuthProviderProps;
  disableTransitionOnChange?: boolean;
  enableSystem?: boolean;
  googleAnalyticsId?: string;
  includeLazyModalErrorDebug?: boolean;
  includeMarketingTracking?: boolean;
  includeSpeedInsights?: boolean;
  includeToaster?: boolean;
  includeVercelAnalytics?: boolean;
  marketingConsentDefault?: 'denied' | 'granted';
  marketingGtmContainerId?: string;
  marketingLinkedinConversionIds?: MarketingTrackingConfig['linkedinConversionIds'];
  marketingLinkedinPartnerId?: string;
  marketingMetaPixelId?: string;
  marketingXEventIds?: MarketingTrackingConfig['xEventIds'];
  marketingXPixelId?: string;
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
  const isPlaywrightTest = process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === 'true';

  return (
    <BetterAuthProvider
      {...authProps}
      {...(isPlaywrightTest
        ? {
            __internal_bypassMissingPublishableKey: true,
            publishableKey: '',
          }
        : {})}
      appearance={{
        ...authProps?.appearance,
        theme: resolvedTheme === 'dark' ? dark : authProps?.appearance?.theme,
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
  googleAnalyticsId,
  includeLazyModalErrorDebug = true,
  includeMarketingTracking = true,
  includeSpeedInsights = true,
  includeToaster = true,
  includeVercelAnalytics = true,
  marketingConsentDefault = 'denied',
  marketingGtmContainerId,
  marketingLinkedinConversionIds,
  marketingLinkedinPartnerId,
  marketingMetaPixelId,
  marketingXEventIds,
  marketingXPixelId,
  storageKey = THEME_STORAGE_KEY,
}: AppProvidersProps) {
  const marketingConfig = useMemo(
    () => ({
      gaId: googleAnalyticsId,
      gtmContainerId: marketingGtmContainerId,
      linkedinConversionIds: marketingLinkedinConversionIds,
      linkedinPartnerId: marketingLinkedinPartnerId,
      metaPixelId: marketingMetaPixelId,
      xEventIds: marketingXEventIds,
      xPixelId: marketingXPixelId,
    }),
    [
      googleAnalyticsId,
      marketingGtmContainerId,
      marketingLinkedinConversionIds,
      marketingLinkedinPartnerId,
      marketingMetaPixelId,
      marketingXEventIds,
      marketingXPixelId,
    ],
  );
  const content = (
    <>
      <ThemeCookieSync />
      {children}
      {includeToaster ? (
        <Toaster richColors closeButton position="top-right" />
      ) : null}
      {includeLazyModalErrorDebug ? <LazyModalErrorDebug /> : null}
      {includeVercelAnalytics ? <Analytics /> : null}
      {includeSpeedInsights ? <SpeedInsights /> : null}
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
