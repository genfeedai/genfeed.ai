import { getAllCompetitorSlugs } from '@data/competitors.data';
import ComparisonPage from '@public/vs/[slug]/comparison-page';
import {
  formatCompetitorSlug,
  getCompetitorBySlugCached,
} from '@public/vs/[slug]/competitor-loader';
import { EnvironmentService } from '@services/core/environment.service';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

export function generateStaticParams() {
  return getAllCompetitorSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const previousImages = (await parent).openGraph?.images || [];
  const { slug } = await params;
  const competitorName = formatCompetitorSlug(slug);
  const title = `Genfeed vs ${competitorName} (2026) — AI Content Platform Comparison`;
  const description = `Compare Genfeed with ${competitorName}. See how AI-powered content generation, pricing, features, and capabilities stack up side by side.`;
  const url = `${EnvironmentService.apps.website}/vs/${slug}`;

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

export default async function Page({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const competitor = await getCompetitorBySlugCached(slug);
  if (!competitor) {
    notFound();
  }

  const competitorName = formatCompetitorSlug(slug);
  const url = `${EnvironmentService.apps.website}/vs/${slug}`;
  const description = `Compare Genfeed with ${competitorName}. See how AI-powered content generation, pricing, features, and capabilities stack up side by side.`;

  const comparisonJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    about: {
      '@type': 'SoftwareApplication',
      applicationCategory: 'BusinessApplication',
      name: 'Genfeed',
    },
    description,
    mentions: {
      '@type': 'SoftwareApplication',
      name: competitorName,
    },
    name: `Genfeed vs ${competitorName}`,
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
        item: 'https://genfeed.ai/vs',
        name: 'Comparisons',
        position: 2,
      },
      {
        '@type': 'ListItem',
        item: url,
        name: `vs ${competitorName}`,
        position: 3,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json">
        {JSON.stringify(comparisonJsonLd)}
      </script>
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </script>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <ComparisonPage competitor={competitor} />
      </Suspense>
    </>
  );
}
