import { buildComparisonFaqJsonLd } from '@data/comparison-faq-jsonld';
import { getAllCompetitorSlugs } from '@data/competitors.data';
import { stringifyJsonLd } from '@data/json-ld';
import { getMarketingOgImage } from '@data/marketing-og.data';
import { fitDescription } from '@data/seo-copy';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import ComparisonPage from '@public/vs/[slug]/comparison-page';
import { getCompetitorBySlugCached } from '@public/vs/[slug]/competitor-loader';
import { EnvironmentService } from '@services/core/environment.service';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

export function generateStaticParams() {
  return getAllCompetitorSlugs().map((slug) => ({ slug }));
}

export function buildComparisonDescription(competitorName: string): string {
  return fitDescription(
    `Genfeed vs ${competitorName}: what each makes, where it publishes and what it costs, so you can pick the tool that fits how you create and post.`,
    `Genfeed vs ${competitorName}: compare what each tool makes, which channels it publishes to and what each plan costs, side by side.`,
  );
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const { slug } = await params;
  const competitor = await getCompetitorBySlugCached(slug);
  if (!competitor) {
    notFound();
  }

  const competitorName = competitor.name;
  const title = `Genfeed vs ${competitorName} (2026): features and pricing compared`;
  const description = buildComparisonDescription(competitorName);
  const url = `${EnvironmentService.apps.website}/vs/${slug}`;

  const previousImages = [getMarketingOgImage(`/vs/${slug}`, competitorName)];

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

  const competitorName = competitor.name;
  const url = `${EnvironmentService.apps.website}/vs/${slug}`;
  const description = buildComparisonDescription(competitorName);

  const comparisonJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'WebPage',
    about: {
      '@type': 'Thing',
      name: 'Genfeed',
    },
    description,
    mentions: {
      '@type': 'Thing',
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
        {stringifyJsonLd(comparisonJsonLd)}
      </script>
      <script type="application/ld+json">
        {stringifyJsonLd(breadcrumbJsonLd)}
      </script>
      <script type="application/ld+json">
        {stringifyJsonLd(buildComparisonFaqJsonLd(competitor))}
      </script>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <ComparisonPage competitor={competitor} />
      </Suspense>
    </>
  );
}
