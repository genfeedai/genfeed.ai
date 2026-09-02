'use client';

import {
  DEFAULT_THEME,
  isThemePreference,
  THEME_STORAGE_KEY,
} from '@genfeedai/contracts/constants';
import type { AppProvidersProps } from '@genfeedai/props/providers/app-providers.props';
import { QueryClientProvider } from '@tanstack/react-query';
import { makeQueryClient } from '@ui/providers/query-client';
import ThemeCookieSync from '@ui/providers/ThemeCookieSync';
import { ThemeStorageBootstrapScript } from '@ui/theme/ThemeBootstrapScript';
import dynamic from 'next/dynamic';
import { ThemeProvider, useTheme } from 'next-themes';
import { useState } from 'react';
import { Toaster } from 'sonner';
import FormModEnterSubmit from './FormModEnterSubmit';

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

function AppToaster() {
  const { theme } = useTheme();

  return (
    <Toaster
      richColors
      closeButton
      position="top-right"
      theme={isThemePreference(theme) ? theme : DEFAULT_THEME}
    />
  );
}

export default function AppProviders({
  children,
  initialTheme,
  disableTransitionOnChange = true,
  enableSystem = true,
  includeLazyModalErrorDebug = true,
  includeToaster = true,
  nonce,
  storageKey = THEME_STORAGE_KEY,
}: AppProvidersProps) {
  const [queryClient] = useState(makeQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeStorageBootstrapScript nonce={nonce} storageKey={storageKey} />
      <ThemeProvider
        attribute="data-theme"
        enableSystem={enableSystem}
        defaultTheme={initialTheme}
        storageKey={storageKey}
        disableTransitionOnChange={disableTransitionOnChange}
        nonce={nonce}
      >
        <ThemeCookieSync storageKey={storageKey} />
        <FormModEnterSubmit />
        {children}
        {includeToaster ? <AppToaster /> : null}
        {includeLazyModalErrorDebug ? <LazyModalErrorDebug /> : null}
      </ThemeProvider>
      <LazyReactQueryDevtools initialIsOpen={false} />
    </QueryClientProvider>
  );
}
