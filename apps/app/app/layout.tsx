import './styles.css';

import { isBetterAuthEnabled } from '@genfeedai/auth-client/server';
import {
  DEFAULT_THEME,
  THEME_STORAGE_KEY,
} from '@genfeedai/contracts/constants';
import { fontVariables } from '@genfeedai/fonts';
import { metadata as metadataHelper } from '@helpers/media/metadata/metadata.helper';
import { DEFAULT_LOCALE } from '@helpers/ui/locale/locale.helper';
import type { LayoutProps } from '@props/layout/layout.props';
import AppProviders from '@ui/providers/AppProviders';
import AppHtmlDocument from '@ui/shell/AppHtmlDocument';
import { createAppMetadata, createPwaMetadata } from '@ui/shell/metadata';
import type { Metadata, Viewport } from 'next';
import { Suspense } from 'react';
import AnalyticsAnonymousSessionSync from '@/components/analytics/AnalyticsAnonymousSessionSync';
import DesktopDragStrip from '@/components/desktop/DesktopDragStrip';
import ServiceWorkerRegistrar from '@/components/pwa/ServiceWorkerRegistrar';
import RuntimeConfigScript from '@/components/runtime/RuntimeConfigScript';
import DeploymentVersionWatcher from '@/components/version/DeploymentVersionWatcher';
import AppIntlProvider from '../i18n/AppIntlProvider';

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
    ...(process.env.GENFEED_RUNTIME_CONFIG_ENDPOINT === '1'
      ? {}
      : { betterAuthEnabled: isBetterAuthEnabled() }),
  };

  return `globalThis.__GENFEED_RUNTIME_CONFIG__=Object.assign(${JSON.stringify(
    config,
  ).replaceAll('<', '\\u003c')}, globalThis.__GENFEED_RUNTIME_CONFIG__||{});`;
}

export default function RootLayout({ children }: LayoutProps) {
  return (
    <AppHtmlDocument
      initialTheme={DEFAULT_THEME}
      fontVariables={fontVariables}
      bodyClassName="gf-app gf-studio-app"
      lang={DEFAULT_LOCALE}
      head={
        <>
          <RuntimeConfigScript source={createRuntimeConfigScript()} />
          {process.env.GENFEED_RUNTIME_CONFIG_ENDPOINT === '1' && (
            <script src="/runtime-config.js" />
          )}
        </>
      }
    >
      {/* The client module loads the offline catalog once instead of serializing
          it into every prerendered route. Server translations still use request.ts. */}
      <AppIntlProvider
        locale={DEFAULT_LOCALE}
        timeZone={Intl.DateTimeFormat().resolvedOptions().timeZone}
      >
        <Suspense fallback={null}>
          <AppProviders
            initialTheme={DEFAULT_THEME}
            storageKey={THEME_STORAGE_KEY}
          >
            <AnalyticsAnonymousSessionSync />
            <DesktopDragStrip />
            <DeploymentVersionWatcher />
            <ServiceWorkerRegistrar />
            {children}
          </AppProviders>
        </Suspense>
      </AppIntlProvider>
    </AppHtmlDocument>
  );
}
