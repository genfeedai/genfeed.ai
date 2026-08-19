'use client';

import { BetterAuthProvider } from '@genfeedai/auth-client/react';
import { dark } from '@genfeedai/auth-client/themes';
import WebMcpProvider from '@ui/providers/WebMcpProvider';
import dynamic from 'next/dynamic';
import { ThemeProvider } from 'next-themes';
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
  authProps?: BetterAuthProviderProps;
  disableTransitionOnChange?: boolean;
  includeLazyModalErrorDebug?: boolean;
  includeToaster?: boolean;
}

export default function AppProviders({
  children,
  authProps,
  disableTransitionOnChange = true,
  includeLazyModalErrorDebug = true,
  includeToaster = true,
}: AppProvidersProps) {
  const appearance = authProps?.appearance;

  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="dark"
      disableTransitionOnChange={disableTransitionOnChange}
      enableSystem={false}
      forcedTheme="dark"
      storageKey="genfeed-website-theme"
    >
      <BetterAuthProvider
        {...authProps}
        appearance={{
          ...(appearance ?? {}),
          theme: dark,
        }}
      >
        <WebMcpProvider />
        {children}
        {includeToaster ? (
          <Toaster richColors closeButton position="top-right" theme="dark" />
        ) : null}
        {includeLazyModalErrorDebug ? <LazyModalErrorDebug /> : null}
      </BetterAuthProvider>
    </ThemeProvider>
  );
}
