'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { THEME_STORAGE_KEY } from '@genfeedai/constants';
import ThemeCookieSync from '@ui/providers/ThemeCookieSync';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import dynamic from 'next/dynamic';
import { ThemeProvider, useTheme } from 'next-themes';
import type { ComponentProps, ReactNode } from 'react';
import { Toaster } from 'sonner';
import MarketingTrackingProvider from '../../marketing/MarketingTrackingProvider';

const LazyModalErrorDebug = dynamic(
  () => import('@ui/modals/system/error-debug/ModalErrorDebug'),
  { ssr: false },
);

type ClerkProviderProps = Omit<
  ComponentProps<typeof ClerkProvider>,
  'children'
>;

export interface AppProvidersProps {
  children: ReactNode;
  initialTheme: string;
  clerkProps?: ClerkProviderProps;
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
  marketingLinkedinPartnerId?: string;
  marketingMetaPixelId?: string;
  marketingXPixelId?: string;
  storageKey?: string;
}

function ThemedClerkProvider({
  children,
  clerkProps,
}: {
  children: ReactNode;
  clerkProps?: ClerkProviderProps;
}) {
  const { resolvedTheme } = useTheme();
  const isPlaywrightTest = process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === 'true';

  return (
    <ClerkProvider
      {...clerkProps}
      {...(isPlaywrightTest
        ? {
            __internal_bypassMissingPublishableKey: true,
            publishableKey: '',
          }
        : {})}
      appearance={{
        ...clerkProps?.appearance,
        theme: resolvedTheme === 'dark' ? dark : clerkProps?.appearance?.theme,
      }}
    >
      {children}
    </ClerkProvider>
  );
}

export default function AppProviders({
  children,
  initialTheme,
  clerkProps,
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
  marketingLinkedinPartnerId,
  marketingMetaPixelId,
  marketingXPixelId,
  storageKey = THEME_STORAGE_KEY,
}: AppProvidersProps) {
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
      <ThemedClerkProvider clerkProps={clerkProps}>
        {includeMarketingTracking ? (
          <MarketingTrackingProvider
            config={{
              gaId: googleAnalyticsId,
              gtmContainerId: marketingGtmContainerId,
              linkedinPartnerId: marketingLinkedinPartnerId,
              metaPixelId: marketingMetaPixelId,
              xPixelId: marketingXPixelId,
            }}
            consentDefault={marketingConsentDefault}
          >
            {content}
          </MarketingTrackingProvider>
        ) : (
          content
        )}
      </ThemedClerkProvider>
    </ThemeProvider>
  );
}
