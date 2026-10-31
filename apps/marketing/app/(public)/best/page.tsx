import { stringifyJsonLd } from '@data/json-ld';
import { getMarketingOgImage } from '@data/marketing-og.data';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import BestHubContent from '@public/best/best-hub-content';
import type { Metadata } from 'next';

const bestDescription =
  'Guides to AI tools for content creation, grouped by the job they do, with the licence, the trade-offs and when each tool is the better pick.';
const bestTitle = `Best AI Content Tools: Guides | ${metadata.name}`;

const bestJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  description: bestDescription,
  isPartOf: {
    '@type': 'WebSite',
    name: metadata.name,
    url: metadata.url,
  },
  name: 'Best AI content tools',
  url: `${metadata.url}/best`,
};

export function generateMetadata(): Metadata {
  const images = [getMarketingOgImage('/best', 'Best AI content tools')];

  return {
    alternates: {
      canonical: `${metadata.url}/best`,
    },
    description: bestDescription,
    openGraph: {
      description: bestDescription,
      images,
      siteName: metadata.name,
      title: bestTitle,
      type: 'website',
      url: `${metadata.url}/best`,
    },
    title: bestTitle,
    twitter: {
      card: 'summary_large_image',
      description: bestDescription,
      images,
      title: bestTitle,
    },
  };
}

export default function BestPage() {
  return (
    <>
      <script type="application/ld+json">{stringifyJsonLd(bestJsonLd)}</script>
      <BestHubContent />
    </>
  );
}
