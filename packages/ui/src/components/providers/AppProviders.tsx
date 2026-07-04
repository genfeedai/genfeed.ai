'use client';

import { THEME_STORAGE_KEY } from '@genfeedai/constants';
import type { AppProvidersProps } from '@genfeedai/props/providers/app-providers.props';
import { GoogleAnalytics } from '@next/third-parties/google';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@ui/providers/query-client';
import ThemeCookieSync from '@ui/providers/ThemeCookieSync';
import dynamic from 'next/dynamic';
import { ThemeProvider } from 'next-themes';
import { useState } from 'react';
import { Toaster } from 'sonner';

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

export default function AppProviders({
  children,
  initialTheme,
  disableTransitionOnChange = true,
  enableSystem = false,
  googleAnalyticsId,
  includeLazyModalErrorDebug = true,
  includeToaster = true,
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
        <ThemeCookieSync />
        {children}
        {includeToaster ? (
          <Toaster richColors closeButton position="top-right" />
        ) : null}
        {includeLazyModalErrorDebug ? <LazyModalErrorDebug /> : null}
        {googleAnalyticsId ? (
          <GoogleAnalytics gaId={googleAnalyticsId} />
        ) : null}
      </ThemeProvider>
      <LazyReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
