import { getAllBestListSlugs, getBestList } from '@data/best-lists.data';
import {
  buildBestListFaqJsonLd,
  buildBestListJsonLd,
} from '@data/best-lists-jsonld';
import { stringifyJsonLd } from '@data/json-ld';
import { getMarketingOgImage } from '@data/marketing-og.data';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import BestListContent from '@public/best/[slug]/best-list-content';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';

export function generateStaticParams() {
  return getAllBestListSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const list = getBestList(slug);
  if (!list) {
    notFound();
  }

  const url = `${metadata.url}/best/${slug}`;
  const images = [getMarketingOgImage(`/best/${slug}`, list.heading)];

  return {
    alternates: { canonical: url },
    description: list.description,
    openGraph: {
      description: list.description,
      images,
      siteName: metadata.name,
      title: list.title,
      type: 'website',
      url,
    },
    title: list.title,
    twitter: {
      card: 'summary_large_image',
      description: list.description,
      images,
      title: list.title,
    },
  };
}

export default async function BestListPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const list = getBestList(slug);
  if (!list) {
    notFound();
  }

  const breadcrumbJsonLd = {
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: [
      { '@type': 'ListItem', item: metadata.url, name: 'Home', position: 1 },
      {
        '@type': 'ListItem',
        item: `${metadata.url}/best`,
        name: 'Guides',
        position: 2,
      },
      {
        '@type': 'ListItem',
        item: `${metadata.url}/best/${slug}`,
        name: list.heading,
        position: 3,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(buildBestListJsonLd(list))}
      </script>
      <script type="application/ld+json">
        {stringifyJsonLd(buildBestListFaqJsonLd(list))}
      </script>
      <script type="application/ld+json">
        {stringifyJsonLd(breadcrumbJsonLd)}
      </script>
      <BestListContent list={list} />
    </>
  );
}
