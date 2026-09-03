import './styles.css';

import { stringifyJsonLd } from '@data/json-ld';
import { fontVariables } from '@genfeedai/fonts';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';
import { metadata as metadataHelper } from '@helpers/media/metadata/metadata.helper';
import type { LayoutProps } from '@props/layout/layout.props';
import AppProviders from '@ui/providers/AppProviders';
import AppHtmlDocument from '@ui/shell/AppHtmlDocument';
import { createAppMetadata } from '@ui/shell/metadata';

const { name, description, url, cards } = metadataHelper;

export const metadata = createAppMetadata({
  description,
  metadataBase: 'https://genfeed.ai',
  overrides: {
    keywords:
      'genfeed,genfeed.ai,AI content studio,AI content generation,AI video generator,social media publishing,content marketing platform,content analytics',
    openGraph: {
      description,
      images: {
        alt: 'Genfeed.ai - the AI content studio',
        height: 836,
        type: 'image/jpeg',
        url: cards.default,
        width: 1600,
      },
      siteName: name,
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
    'AI video generation',
    'multi-platform publishing',
    'content analytics',
    'content marketing',
  ],
  logo: cdnAsset('/assets/branding/logo.jpg'),
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

const layoutHead = (
  <>
    <script type="application/ld+json">
      {stringifyJsonLd(organizationJsonLd)}
    </script>
    <script type="application/ld+json">{stringifyJsonLd(websiteJsonLd)}</script>
  </>
);

export default function RootLayout({ children }: LayoutProps) {
  return (
    <AppHtmlDocument
      initialTheme="dark"
      fontVariables={fontVariables}
      bodyClassName="gf-app flex flex-col"
      head={layoutHead}
    >
      <AppProviders>{children}</AppProviders>
    </AppHtmlDocument>
  );
}
