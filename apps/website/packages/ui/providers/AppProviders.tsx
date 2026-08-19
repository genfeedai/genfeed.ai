'use client';

import { BetterAuthProvider } from '@genfeedai/auth-client/react';
import { dark } from '@genfeedai/auth-client/themes';
import {
  DEFAULT_THEME,
  isThemePreference,
  THEME_STORAGE_KEY,
  type ThemePreference,
} from '@genfeedai/constants';
import ThemeCookieSync from '@ui/components/providers/ThemeCookieSync';
import { ThemeStorageBootstrapScript } from '@ui/components/theme/ThemeBootstrapScript';
import WebMcpProvider from '@ui/providers/WebMcpProvider';
import dynamic from 'next/dynamic';
import { ThemeProvider, useTheme } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';

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
  initialTheme: ThemePreference;
  authProps?: BetterAuthProviderProps;
  disableTransitionOnChange?: boolean;
  enableSystem?: boolean;
  includeLazyModalErrorDebug?: boolean;
  includeToaster?: boolean;
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
  authProps,
  disableTransitionOnChange = true,
  enableSystem = true,
  includeLazyModalErrorDebug = true,
  includeToaster = true,
  storageKey = THEME_STORAGE_KEY,
}: AppProvidersProps) {
  return (
    <>
      <ThemeStorageBootstrapScript storageKey={storageKey} />
      <ThemeProvider
        attribute="data-theme"
        enableSystem={enableSystem}
        defaultTheme={initialTheme}
        storageKey={storageKey}
        disableTransitionOnChange={disableTransitionOnChange}
      >
        <ThemedBetterAuthProvider authProps={authProps}>
          <ThemeCookieSync storageKey={storageKey} />
          <WebMcpProvider />
          {children}
          {includeToaster ? <AppToaster /> : null}
          {includeLazyModalErrorDebug ? <LazyModalErrorDebug /> : null}
        </ThemedBetterAuthProvider>
      </ThemeProvider>
    </>
  );
}
