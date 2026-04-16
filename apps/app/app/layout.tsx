import '@styles/globals.scss';

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
import DesktopDragStrip from '@/components/desktop/DesktopDragStrip';
import { EditionBadge } from '@/components/edition-badge/EditionBadge';

const { name, description } = metadataHelper;
const pwaConfig = createPwaMetadata('app');

export const metadata: Metadata = createAppMetadata({
  description,
  metadataBase: 'https://cdn.genfeed.ai',
  pwaMetadata: pwaConfig.metadata,
  title: name,
});

export const viewport: Viewport = pwaConfig.viewport;

export default async function RootLayout({ children }: LayoutProps) {
  const initialTheme = await resolveRequestTheme();
  const isDesktopShell = process.env.NEXT_PUBLIC_DESKTOP_SHELL === '1';
  const bodyClassName = isDesktopShell ? 'gf-app gf-desktop-shell' : 'gf-app';

  return (
    <AppHtmlDocument
      initialTheme={initialTheme}
      fontVariables={fontVariables}
      bodyClassName={bodyClassName}
    >
      <AppProviders
        initialTheme={initialTheme}
        storageKey={THEME_STORAGE_KEY}
        clerkProps={{
          signInFallbackRedirectUrl: '/',
          signInForceRedirectUrl: '/',
          signInUrl: '/login',
          signUpUrl: '/sign-up',
        }}
        googleAnalyticsId={EnvironmentService.GA_ID}
      >
        <DesktopDragStrip />
        {children}
        <EditionBadge />
      </AppProviders>
    </AppHtmlDocument>
  );
}
