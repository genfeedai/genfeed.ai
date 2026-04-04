import { getAllUseCaseSlugs } from '@data/use-cases.data';
import {
  formatUseCaseSlug,
  getUseCaseBySlugCached,
} from '@public/use-cases/[slug]/use-case-loader';
import UseCasesContent from '@public/use-cases/[slug]/use-cases-content';
import { EnvironmentService } from '@services/core/environment.service';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

export function generateStaticParams() {
  return getAllUseCaseSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const previousImages = (await parent).openGraph?.images || [];
  const { slug } = await params;
  const audienceName = formatUseCaseSlug(slug);
  const title = `Genfeed for ${audienceName} — AI Content Creation at Scale`;
  const description = `Discover how ${audienceName.toLowerCase()} use Genfeed to create professional AI-powered videos, images, and marketing content at scale.`;
  const url = `${EnvironmentService.apps.website}/use-cases/${slug}`;

  return {
    alternates: { canonical: url },
    description,
    openGraph: { description, images: [...previousImages], title, url },
    title,
    twitter: { description, images: [...previousImages] },
  };
}

export default async function UseCasesPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  const useCase = await getUseCaseBySlugCached(slug);
  if (!useCase) {
    notFound();
  }

  const audienceName = formatUseCaseSlug(slug);
  const url = `${EnvironmentService.apps.website}/use-cases/${slug}`;
  const description = `Discover how ${audienceName.toLowerCase()} use Genfeed to create professional AI-powered videos, images, and marketing content at scale.`;

  const useCaseJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Service',
    audience: { '@type': 'Audience', audienceType: audienceName },
    description,
    name: `Genfeed for ${audienceName}`,
    provider: {
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
        item: `${EnvironmentService.apps.website}/use-cases`,
        name: 'Use Cases',
        position: 2,
      },
      {
        '@type': 'ListItem',
        item: url,
        name: `For ${audienceName}`,
        position: 3,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json">
        {JSON.stringify(useCaseJsonLd)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </script>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <UseCasesContent useCase={useCase} />
      </Suspense>
    </>
  );
}
