import { stringifyJsonLd } from '@data/json-ld';
import { useCases } from '@data/use-cases.data';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import UseCasesHubContent from '@public/use-cases/use-cases-hub-content';
import type { Metadata, ResolvingMetadata } from 'next';

// Every /use-cases/<slug> breadcrumb points position 2 at this URL, which used
// to 404. The hub also gives the six use-case pages an internal index.

const useCasesDescription =
  'See how AI influencer brands, creators, agencies, e-commerce teams, marketers, and founders use Genfeed to produce and publish content at scale.';

const useCasesUrl = `${metadata.url}/use-cases`;

const useCasesJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  description: useCasesDescription,
  hasPart: useCases.map((useCase) => ({
    '@type': 'WebPage',
    name: `Genfeed for ${useCase.subtitle}`,
    url: `${useCasesUrl}/${useCase.slug}`,
  })),
  isPartOf: {
    '@type': 'WebSite',
    name: metadata.name,
    url: metadata.url,
  },
  name: 'Genfeed Use Cases',
  url: useCasesUrl,
};

export async function generateMetadata(
  _params: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const images = [...((await parent).openGraph?.images || [])];
  const title = `Use Cases: AI Content for Every Team | ${metadata.name}`;

  return {
    alternates: {
      canonical: useCasesUrl,
    },
    description: useCasesDescription,
    openGraph: {
      description: useCasesDescription,
      images,
      siteName: metadata.name,
      title,
      type: 'website',
      url: useCasesUrl,
    },
    title,
    twitter: {
      card: 'summary_large_image',
      description: useCasesDescription,
      images,
      title,
    },
  };
}

export default function UseCasesHubPage() {
  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(useCasesJsonLd)}
      </script>
      <UseCasesHubContent />
    </>
  );
}
