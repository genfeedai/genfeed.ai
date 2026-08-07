import '@styles/globals.css';

import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import { isDesktopClient } from '@genfeedai/config/deployment';
import { THEME_STORAGE_KEY } from '@genfeedai/constants';
import { fontVariables } from '@genfeedai/fonts';
import { metadata as metadataHelper } from '@helpers/media/metadata/metadata.helper';
import { resolveRequestLocale } from '@helpers/ui/locale/locale.helper';
import { resolveRequestTheme } from '@helpers/ui/theme/theme.helper';
import type { LayoutProps } from '@props/layout/layout.props';
import AppProviders from '@ui/providers/AppProviders';
import AppHtmlDocument from '@ui/shell/AppHtmlDocument';
import { createAppMetadata, createPwaMetadata } from '@ui/shell/metadata';
import type { Metadata, Viewport } from 'next';
import { NextIntlClientProvider } from 'next-intl';
import DesktopDragStrip from '@/components/desktop/DesktopDragStrip';
import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar';
import RuntimeConfigScript from '@/components/runtime/RuntimeConfigScript';
import DeploymentVersionWatcher from '@/components/version/DeploymentVersionWatcher';

const { name, description } = metadataHelper;
const pwaConfig = createPwaMetadata('app');

export const metadata: Metadata = createAppMetadata({
  description,
  metadataBase: 'https://cdn.genfeed.ai',
  // The studio is an authenticated product surface — only the marketing site
  // (apps/website) is meant to rank. Every route inherits this unless it
  // declares its own `robots`.
  overrides: {
    robots: {
      follow: false,
      index: false,
    },
  },
  pwaMetadata: pwaConfig.metadata,
  title: name,
});

export const viewport: Viewport = pwaConfig.viewport;

function createRuntimeConfigScript(): string {
  const config = {
    apiEndpoint: process.env.NEXT_PUBLIC_API_ENDPOINT,
    betterAuthEnabled: isBetterAuthEnabled(),
  };

  return `globalThis.__GENFEED_RUNTIME_CONFIG__=${JSON.stringify(
    config,
  ).replaceAll('<', '\\u003c')};`;
}

export default async function RootLayout({ children }: LayoutProps) {
  const [initialTheme, locale] = await Promise.all([
    resolveRequestTheme(),
    resolveRequestLocale(),
  ]);
  const isDesktopShell = isDesktopClient();
  const bodyClassName = isDesktopShell
    ? 'gf-app gf-desktop-shell gf-studio-app'
    : 'gf-app gf-studio-app';

  return (
    <AppHtmlDocument
      initialTheme={initialTheme}
      fontVariables={fontVariables}
      bodyClassName={bodyClassName}
      lang={locale}
    >
      <RuntimeConfigScript source={createRuntimeConfigScript()} />
      {/* Locale and messages are inherited from i18n/request.ts rather than
          passed here, so server components keep resolving copy on the server
          and only what client components actually read crosses the boundary. */}
      <NextIntlClientProvider>
        <AppProviders
          initialTheme={initialTheme}
          storageKey={THEME_STORAGE_KEY}
        >
          <DesktopDragStrip />
          {/* Desktop ships as a bundled app with its own update path and offline
              story; the deploy skew watcher and the service worker both only
              apply to the Vercel-hosted studio. */}
          {!isDesktopShell ? (
            <>
              <DeploymentVersionWatcher />
              <ServiceWorkerRegistrar />
            </>
          ) : null}
          {children}
        </AppProviders>
      </NextIntlClientProvider>
    </AppHtmlDocument>
  );
}
