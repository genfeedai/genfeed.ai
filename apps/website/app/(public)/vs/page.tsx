import { metadata } from '@helpers/media/metadata/metadata.helper';
import VsHubContent from '@public/vs/vs-hub-content';
import type { Metadata, ResolvingMetadata } from 'next';

const vsDescription =
  'Compare Genfeed with popular AI content creation tools. Side-by-side feature comparisons, pricing breakdowns, and honest assessments to help you choose the right platform.';

const vsJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  description: vsDescription,
  isPartOf: {
    '@type': 'WebSite',
    name: metadata.name,
    url: metadata.url,
  },
  name: 'Genfeed vs Alternatives',
  url: `${metadata.url}/vs`,
};

export async function generateMetadata(
  _params: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const previousImages = (await parent).openGraph?.images || [];
  const images = [...previousImages];
  const title = `Genfeed vs Alternatives (2026) — AI Content Platform Comparisons | ${metadata.name}`;

  return {
    alternates: {
      canonical: `${metadata.url}/vs`,
    },
    description: vsDescription,
    openGraph: {
      description: vsDescription,
      images,
      title,
      url: `${metadata.url}/vs`,
    },
    title,
    twitter: {
      description: vsDescription,
      images,
      title,
    },
  };
}

export default function VsPage() {
  return (
    <>
      <script type="application/ld+json">{JSON.stringify(vsJsonLd)}</script>
      <VsHubContent />
    </>
  );
}
