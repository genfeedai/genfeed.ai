import {
  getAllIntegrationSlugs,
  type Integration,
} from '@data/integrations.data';
import { stringifyJsonLd } from '@data/json-ld';
import { metadata } from '@helpers/media/metadata/metadata.helper';
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

export function buildIntegrationPageJsonLd(
  integration: Integration,
  url: string,
) {
  return {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    about: {
      '@type': 'Thing',
      description: integration.description,
      name: `${integration.name} content integration`,
    },
    description: `Create professional ${integration.name} content with AI. Generate videos, images, and posts optimized for ${integration.name}. Try Genfeed free.`,
    isPartOf: {
      '@type': 'WebSite',
      name: 'Genfeed',
      url: 'https://genfeed.ai',
    },
    name: `Genfeed for ${integration.name}`,
    url,
  };
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

  const title = `Genfeed for ${integration.name}: AI ${integration.name} Content Generator`;
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
      siteName: metadata.name,
      title,
      type: 'website',
      url,
    },
    title,
    twitter: {
      card: 'summary_large_image',
      description,
      images: [...previousImages],
      title,
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

  const url = `${EnvironmentService.apps.website}/integrations/${slug}`;

  const integrationJsonLd = buildIntegrationPageJsonLd(integration, url);

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
        {stringifyJsonLd(integrationJsonLd)}
      </script>
      <script type="application/ld+json">
        {stringifyJsonLd(breadcrumbJsonLd)}
      </script>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <IntegrationContent integration={integration} />
      </Suspense>
    </>
  );
}
