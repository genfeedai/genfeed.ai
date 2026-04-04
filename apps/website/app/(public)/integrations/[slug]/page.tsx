import { getAllIntegrationSlugs } from '@data/integrations.data';
import IntegrationContent from '@public/integrations/[slug]/integration-content';
import { getIntegrationBySlugCached } from '@public/integrations/[slug]/integration-loader';
import { EnvironmentService } from '@services/core/environment.service';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

export function generateStaticParams() {
  return getAllIntegrationSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const previousImages = (await parent).openGraph?.images || [];
  const { slug } = await params;
  const integration = await getIntegrationBySlugCached(slug);

  if (!integration) {
    return {
      title: 'Integration Not Found | Genfeed',
    };
  }

  const title = `Genfeed for ${integration.name} — AI ${integration.name} Content Generator`;
  const description = `Create professional ${integration.name} content with AI. Generate videos, images, and posts optimized for ${integration.name}. Try Genfeed free.`;
  const url = `${EnvironmentService.apps.website}/integrations/${slug}`;

  return {
    alternates: {
      canonical: url,
    },
    description,
    openGraph: {
      description,
      images: [...previousImages],
      title,
      url,
    },
    title,
    twitter: {
      description,
      images: [...previousImages],
    },
  };
}

export default async function IntegrationPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const integration = await getIntegrationBySlugCached(slug);

  if (!integration) {
    notFound();
  }

  const description = `Create professional ${integration.name} content with AI. Generate videos, images, and posts optimized for ${integration.name}. Try Genfeed free.`;
  const url = `${EnvironmentService.apps.website}/integrations/${slug}`;

  const integrationJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    applicationCategory: 'BusinessApplication',
    description,
    name: `Genfeed for ${integration.name}`,
    offers: {
      '@type': 'AggregateOffer',
      highPrice: '4999',
      lowPrice: '0',
      offerCount: 4,
      priceCurrency: 'USD',
    },
    operatingSystem: 'Web',
    publisher: {
      '@type': 'Organization',
      name: 'Genfeed',
      url: 'https://genfeed.ai',
    },
    url,
  };

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      {
        '@type': 'ListItem',
        item: 'https://genfeed.ai',
        name: 'Home',
        position: 1,
      },
      {
        '@type': 'ListItem',
        item: 'https://genfeed.ai/integrations',
        name: 'Integrations',
        position: 2,
      },
      {
        '@type': 'ListItem',
        item: url,
        name: integration.name,
        position: 3,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json">
        {JSON.stringify(integrationJsonLd)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </script>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <IntegrationContent integration={integration} />
      </Suspense>
    </>
  );
}
