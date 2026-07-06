import { getAllCaseStudySlugs } from '@data/case-studies.data';
import { stringifyJsonLd } from '@data/json-ld';
import CaseStudyContent from '@public/case-studies/[slug]/case-study-content';
import {
  formatCaseStudySlug,
  getCaseStudyBySlugCached,
} from '@public/case-studies/[slug]/case-study-loader';
import { EnvironmentService } from '@services/core/environment.service';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import type { Metadata, ResolvingMetadata } from 'next';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

export function generateStaticParams() {
  return getAllCaseStudySlugs().map((slug) => ({ slug }));
}

export async function generateMetadata(
  { params }: { params: Promise<{ slug: string }> },
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const [resolvedParams, resolvedParent] = await Promise.all([params, parent]);
  const previousImages = resolvedParent.openGraph?.images || [];
  const caseStudy = await getCaseStudyBySlugCached(resolvedParams.slug);
  const title = caseStudy?.headline ?? formatCaseStudySlug(resolvedParams.slug);
  const description =
    caseStudy?.summary ??
    'Genfeed case-study template and public social-proof pipeline.';
  const url = `${EnvironmentService.apps.website}/case-studies/${resolvedParams.slug}`;

  return {
    alternates: { canonical: url },
    description,
    openGraph: { description, images: [...previousImages], title, url },
    title,
    twitter: { description, images: [...previousImages] },
  };
}

export default async function CaseStudyPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const caseStudy = await getCaseStudyBySlugCached(slug);

  if (!caseStudy) {
    notFound();
  }

  const url = `${EnvironmentService.apps.website}/case-studies/${slug}`;
  const caseStudyJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    about: caseStudy.customerType,
    dateModified: caseStudy.updatedAt,
    description: caseStudy.summary,
    headline: caseStudy.headline,
    isAccessibleForFree: true,
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
        item: `${EnvironmentService.apps.website}/case-studies`,
        name: 'Case Studies',
        position: 2,
      },
      {
        '@type': 'ListItem',
        item: url,
        name: caseStudy.headline,
        position: 3,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(caseStudyJsonLd)}
      </script>
      <script type="application/ld+json">
        {stringifyJsonLd(breadcrumbJsonLd)}
      </script>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <CaseStudyContent caseStudy={caseStudy} />
      </Suspense>
    </>
  );
}
