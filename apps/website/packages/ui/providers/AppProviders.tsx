'use client';

import { EnvironmentService } from '@services/core/environment.service';
import WebMcpProvider from '@ui/providers/WebMcpProvider';
import dynamic from 'next/dynamic';
import { ThemeProvider } from 'next-themes';
import type { ReactNode } from 'react';

const LazyModalErrorDebug = dynamic(
  () => import('@ui/modals/system/error-debug/ModalErrorDebug'),
  { ssr: false },
);

/**
 * Toasts only follow a click (copy, share), so the toaster loads after
 * hydration rather than in every page's first bundle. sonner replays toasts
 * raised before the Toaster subscribes, so none are lost while it loads.
 */
const LazyToaster = dynamic(
  () => import('sonner').then((module) => module.Toaster),
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
  // Error boundaries open this debug modal only outside production, and it
  // pulls in the clipboard service, the logger and the Sentry SDK. Production
  // pages never mount it, so none of that downloads.
  includeLazyModalErrorDebug = !EnvironmentService.isProduction,
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
        <LazyToaster richColors closeButton position="top-right" theme="dark" />
      ) : null}
      {includeLazyModalErrorDebug ? <LazyModalErrorDebug /> : null}
    </ThemeProvider>
  );
}
