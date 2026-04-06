import '@styles/globals.scss';

import AppHtmlDocument from '@components/shell/AppHtmlDocument';
import { createAppMetadata } from '@components/shell/metadata';
import { THEME_STORAGE_KEY } from '@genfeedai/constants';
import { fontVariables } from '@genfeedai/fonts';
import { metadata as metadataHelper } from '@helpers/media/metadata/metadata.helper';
import { resolveRequestTheme } from '@helpers/ui/theme/theme.helper';
import type { LayoutProps } from '@props/layout/layout.props';
import AppProviders from '@ui/providers/AppProviders';

const { name, description } = metadataHelper;

export const metadata = createAppMetadata({
  description,
  metadataBase: 'https://cdn.genfeed.ai',
  overrides: {
    robots: {
      follow: false,
      index: false,
    },
  },
  title: name,
});

export default async function RootLayout({ children }: LayoutProps) {
  const initialTheme = await resolveRequestTheme();

  return (
    <AppHtmlDocument
      initialTheme={initialTheme}
      fontVariables={fontVariables}
      bodyClassName="gf-app"
    >
      <AppProviders
        initialTheme={initialTheme}
        storageKey={THEME_STORAGE_KEY}
        clerkProps={{ signInUrl: '/login' }}
      >
        {children}
      </AppProviders>
    </AppHtmlDocument>
  );
}
