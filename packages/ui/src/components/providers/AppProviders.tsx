'use client';

import { ClerkProvider } from '@clerk/nextjs';
import { dark } from '@clerk/themes';
import { THEME_STORAGE_KEY } from '@genfeedai/constants';
import { GoogleAnalytics } from '@next/third-parties/google';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import ThemeCookieSync from '@ui/providers/ThemeCookieSync';
import { Analytics } from '@vercel/analytics/react';
import { SpeedInsights } from '@vercel/speed-insights/next';
import dynamic from 'next/dynamic';
import { ThemeProvider, useTheme } from 'next-themes';
import { type ComponentProps, type ReactNode, useState } from 'react';
import { Toaster } from 'sonner';

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
        // 30s: avoid refetch-on-every-mount storm. Mutations still invalidate
        // explicitly via queryClient.invalidateQueries — staleness is the floor,
        // not the ceiling.
        staleTime: 30_000,
      },
    },
  });
}

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
  includeSpeedInsights?: boolean;
  includeToaster?: boolean;
  includeVercelAnalytics?: boolean;
  storageKey?: string;
}

/**
 * Whether Clerk is available in this deployment.
 * Checked once at module load — NEXT_PUBLIC_ vars are inlined at build time.
 */
const cloudConnected = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
const hostedCloud = process.env.NEXT_PUBLIC_GENFEED_CLOUD === 'true';

function ClerkProviderWithTheme({
  children,
  clerkProps,
  bypassMissingPublishableKey = false,
}: {
  children: ReactNode;
  clerkProps?: ClerkProviderProps;
  bypassMissingPublishableKey?: boolean;
}) {
  const { resolvedTheme } = useTheme();
  const isPlaywrightTest = process.env.NEXT_PUBLIC_PLAYWRIGHT_TEST === 'true';
  const shouldBypassMissingPublishableKey =
    isPlaywrightTest || bypassMissingPublishableKey;

  return (
    <ClerkProvider
      {...clerkProps}
      {...(shouldBypassMissingPublishableKey
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
}: {
  children: ReactNode;
  clerkProps?: ClerkProviderProps;
}) {
  if ((!cloudConnected && hostedCloud) || !clerkProps) {
    return <>{children}</>;
  }

  return (
    <ClerkProviderWithTheme
      clerkProps={clerkProps}
      bypassMissingPublishableKey={!cloudConnected}
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
