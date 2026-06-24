import '@styles/globals.css';

import { THEME_STORAGE_KEY } from '@genfeedai/constants';
import { fontVariables } from '@genfeedai/fonts';
import { metadata as metadataHelper } from '@helpers/media/metadata/metadata.helper';
import { resolveRequestTheme } from '@helpers/ui/theme/theme.helper';
import type { LayoutProps } from '@props/layout/layout.props';
import { EnvironmentService } from '@services/core/environment.service';
import AppProviders from '@ui/providers/AppProviders';
import AppHtmlDocument from '@ui/shell/AppHtmlDocument';
import { createAppMetadata, createPwaMetadata } from '@ui/shell/metadata';
import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import DesktopDragStrip from '@/components/desktop/DesktopDragStrip';

const { name, description } = metadataHelper;
const pwaConfig = createPwaMetadata('app');

export const metadata: Metadata = createAppMetadata({
  description,
  metadataBase: 'https://cdn.genfeed.ai',
  pwaMetadata: pwaConfig.metadata,
  title: name,
});

export const viewport: Viewport = pwaConfig.viewport;

function createRuntimeConfigScript(): string {
  const config = {
    apiEndpoint: process.env.NEXT_PUBLIC_API_ENDPOINT,
    betterAuthEnabled: process.env.NEXT_PUBLIC_BETTER_AUTH_ENABLED !== 'false',
  };

  return `globalThis.__GENFEED_RUNTIME_CONFIG__=${JSON.stringify(
    config,
  ).replaceAll('<', '\\u003c')};`;
}

export default async function RootLayout({ children }: LayoutProps) {
  const initialTheme = await resolveRequestTheme();
  const isDesktopShell = process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1';
  const bodyClassName = isDesktopShell
    ? 'gf-app gf-desktop-shell gf-studio-app'
    : 'gf-app gf-studio-app';
  const googleAnalyticsId = isDesktopShell
    ? undefined
    : EnvironmentService.GA_ID;

  return (
    <AppHtmlDocument
      initialTheme={initialTheme}
      fontVariables={fontVariables}
      bodyClassName={bodyClassName}
    >
      <AppProviders
        initialTheme={initialTheme}
        storageKey={THEME_STORAGE_KEY}
        googleAnalyticsId={googleAnalyticsId}
        includeSpeedInsights={!isDesktopShell}
        includeVercelAnalytics={!isDesktopShell}
      >
        <Script id="genfeed-runtime-config" strategy="beforeInteractive">
          {createRuntimeConfigScript()}
        </Script>
        <DesktopDragStrip />
        {children}
      </AppProviders>
    </AppHtmlDocument>
  );
}
