import '@styles/globals.scss';

import { THEME_STORAGE_KEY } from '@genfeedai/constants';
import { fontVariables } from '@genfeedai/fonts';
import { metadata as metadataHelper } from '@helpers/media/metadata/metadata.helper';
import { resolveRequestTheme } from '@helpers/ui/theme/theme.helper';
import type { LayoutProps } from '@props/layout/layout.props';
import { EnvironmentService } from '@services/core/environment.service';
import AppProviders from '@ui/providers/AppProviders';
import AppHtmlDocument from '@ui/shell/AppHtmlDocument';
import { createAppMetadata } from '@ui/shell/metadata';

const { name, description, url, cards } = metadataHelper;

export const metadata = createAppMetadata({
  description,
  metadataBase: 'https://genfeed.ai',
  overrides: {
    keywords:
      'genfeed,genfeed.ai,ai content generation,b2b content,video generation,image generation,ai avatars,content automation,marketing automation,ai agents',
    openGraph: {
      description,
      images: {
        alt: 'Genfeed.ai - AI-powered content generation platform',
        height: 836,
        type: 'image/jpeg',
        url: cards.default,
        width: 1600,
      },
      title: name,
      type: 'website',
      url,
    },
    twitter: {
      card: 'summary_large_image',
      creator: '@genfeedai',
      creatorId: '1928229187782848512',
      description,
      images: [cards.default],
      site: url,
      title: name,
    },
  },
  title: name,
});

const organizationJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Organization',
  contactPoint: {
    '@type': 'ContactPoint',
    contactType: 'customer service',
    email: 'hello@genfeed.ai',
  },
  description,
  foundingDate: '2024',
  knowsAbout: [
    'AI content generation',
    'video generation',
    'image generation',
    'content marketing',
    'marketing automation',
  ],
  logo: 'https://cdn.genfeed.ai/assets/logo.png',
  name: 'Genfeed',
  sameAs: [
    'https://x.com/genfeedai',
    'https://linkedin.com/company/genfeedai',
    'https://github.com/genfeedai',
    'https://youtube.com/@genfeedai',
    'https://instagram.com/genfeedai',
    'https://tiktok.com/@genfeedai',
  ],
  url: 'https://genfeed.ai',
};

const websiteJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'WebSite',
  description,
  name: 'Genfeed.ai',
  publisher: {
    '@type': 'Organization',
    name: 'Genfeed',
    url: 'https://genfeed.ai',
  },
  url: 'https://genfeed.ai',
};

export default async function RootLayout({ children }: LayoutProps) {
  const initialTheme = await resolveRequestTheme();

  return (
    <AppHtmlDocument
      initialTheme={initialTheme}
      fontVariables={fontVariables}
      bodyClassName="gf-app flex flex-col"
      head={
        <>
          <script type="application/ld+json">
            {JSON.stringify(organizationJsonLd)}
          </script>
          <script type="application/ld+json">
            {JSON.stringify(websiteJsonLd)}
          </script>
        </>
      }
    >
      <AppProviders
        initialTheme={initialTheme}
        storageKey={THEME_STORAGE_KEY}
        googleAnalyticsId={EnvironmentService.GA_ID}
      >
        {children}
      </AppProviders>
    </AppHtmlDocument>
  );
}
