'use client';

import WebMcpProvider from '@ui/providers/WebMcpProvider';
import dynamic from 'next/dynamic';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';
import { Toaster } from 'sonner';

const LazyModalErrorDebug = dynamic(
  () => import('@ui/modals/system/error-debug/ModalErrorDebug'),
  { ssr: false },
);

export interface AppProvidersProps {
  children: ReactNode;
  disableTransitionOnChange?: boolean;
  includeLazyModalErrorDebug?: boolean;
  includeToaster?: boolean;
}

export default function AppProviders({
  children,
  disableTransitionOnChange = true,
  includeLazyModalErrorDebug = true,
  includeToaster = true,
}: AppProvidersProps) {
  return (
    <ThemeProvider
      attribute="data-theme"
      defaultTheme="dark"
      disableTransitionOnChange={disableTransitionOnChange}
      enableSystem={false}
      forcedTheme="dark"
      storageKey="genfeed-website-theme"
    >
      {/* No auth provider: marketing pages must not ship the Better Auth
          client. Pages that need a session call the auth hooks directly. */}
      <WebMcpProvider />
      {children}
      {includeToaster ? (
        <Toaster richColors closeButton position="top-right" theme="dark" />
      ) : null}
      {includeLazyModalErrorDebug ? <LazyModalErrorDebug /> : null}
    </ThemeProvider>
  );
}
