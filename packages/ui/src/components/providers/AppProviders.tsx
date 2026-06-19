'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { THEME_STORAGE_KEY } from '@genfeedai/constants';
import type {
  ClerkProviderWithThemeProps,
  MaybeClerkProviderProps,
  AppProvidersProps as SharedAppProvidersProps,
} from '@genfeedai/props/providers/app-providers.props';
import { GoogleAnalytics } from '@next/third-parties/google';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@ui/providers/query-client';
import ThemeCookieSync from '@ui/providers/ThemeCookieSync';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import dynamic from 'next/dynamic';
import { ThemeProvider, useTheme } from 'next-themes';
import { type ComponentProps, useState } from 'react';
import { Toaster } from 'sonner';

type ClerkProviderProps = Omit<
  ComponentProps<typeof ClerkProvider>,
  'children'
>;

export type AppProvidersProps = SharedAppProvidersProps<ClerkProviderProps>;

type ClerkProviderWithThemeComponentProps =
  ClerkProviderWithThemeProps<ClerkProviderProps>;

type MaybeClerkProviderComponentProps =
  MaybeClerkProviderProps<ClerkProviderProps>;

const LazyModalErrorDebug = dynamic(
  () => import('@ui/modals/system/error-debug/ModalErrorDebug'),
  { ssr: false },
);

// Devtools loaded only in development. Avoids ~50KB in prod bundle.
const LazyReactQueryDevtools =
  process.env.NODE_ENV === 'development'
    ? dynamic(
        () =>
          import('@tanstack/react-query-devtools').then((mod) => ({
            default: mod.ReactQueryDevtools,
          })),
        { ssr: false },
      )
    : () => null;

/**
 * Whether Clerk is available in this deployment.
 * Checked once at module load — NEXT_PUBLIC_ vars are inlined at build time.
 */
const clerkPublishableKey =
  process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY?.trim();
const cloudConnected = Boolean(clerkPublishableKey);
const isHostedCloud = process.env.NEXT_PUBLIC_GENFEED_CLOUD === 'true';

function ClerkProviderWithTheme({
  children,
  clerkProps,
  hasMissingPublishableKeyBypass = false,
}: ClerkProviderWithThemeComponentProps) {
  const { resolvedTheme } = useTheme();
  const isPlaywrightTest = process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === 'true';
  const hasMissingPublishableKeyBypassEnabled =
    isPlaywrightTest || hasMissingPublishableKeyBypass;

  return (
    <ClerkProvider
      {...clerkProps}
      {...(!hasMissingPublishableKeyBypassEnabled && clerkPublishableKey
        ? { publishableKey: clerkPublishableKey }
        : {})}
      {...(hasMissingPublishableKeyBypassEnabled
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

function MaybeClerkProvider({
  children,
  clerkProps,
}: MaybeClerkProviderComponentProps) {
  if ((!cloudConnected && isHostedCloud) || !clerkProps) {
    return <>{children}</>;
  }

  return (
    <ClerkProviderWithTheme
      clerkProps={clerkProps}
      hasMissingPublishableKeyBypass={!cloudConnected}
    >
      {children}
    </ClerkProviderWithTheme>
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
  includeSpeedInsights = true,
  includeToaster = true,
  includeVercelAnalytics = true,
  storageKey = THEME_STORAGE_KEY,
}: AppProvidersProps) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="data-theme"
        enableSystem={enableSystem}
        defaultTheme={initialTheme}
        storageKey={storageKey}
        disableTransitionOnChange={disableTransitionOnChange}
      >
        <MaybeClerkProvider clerkProps={clerkProps}>
          <ThemeCookieSync />
          {children}
          {includeToaster ? (
            <Toaster richColors closeButton position="top-right" />
          ) : null}
          {includeLazyModalErrorDebug ? <LazyModalErrorDebug /> : null}
          {googleAnalyticsId ? (
            <GoogleAnalytics gaId={googleAnalyticsId} />
          ) : null}
          {includeVercelAnalytics ? <Analytics /> : null}
          {includeSpeedInsights ? <SpeedInsights /> : null}
        </MaybeClerkProvider>
      </ThemeProvider>
      <LazyReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
