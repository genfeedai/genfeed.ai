import { stringifyJsonLd } from '@data/json-ld';
import { getMarketingOgImage } from '@data/marketing-og.data';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import type { Metadata, ResolvingMetadata } from 'next';
import { Suspense } from 'react';
import ArticlesList from './articles-list';
import { getPublicArticlesPageCached } from './articles-loader';

const articlesDescription =
  'Discover insights, tutorials, and case studies about AI-powered content creation and digital marketing strategies.';

const ARTICLES_TITLE = 'Articles and Blog: AI Content Insights';
const ARTICLES_PATH = '/articles';

const articlesJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'CollectionPage',
  description: articlesDescription,
  isPartOf: {
    '@type': 'WebSite',
    name: metadata.name,
    url: metadata.url,
  },
  name: 'Genfeed Articles & Blog',
  url: `${metadata.url}${ARTICLES_PATH}`,
};

/** Same page rule the listing uses, so metadata and the rendered page agree. */
function resolveArticlesPage(rawPage: string | undefined): number {
  const parsedPage = Number.parseInt(rawPage ?? '1', 10);
  return Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
}

function articlesListingMetadata(page: number) {
  const pageLabel = page > 1 ? ` – Page ${page}` : '';
  const descriptionBase = articlesDescription.endsWith('.')
    ? articlesDescription.slice(0, -1)
    : articlesDescription;

  return {
    description:
      page > 1 ? `${descriptionBase}${pageLabel}.` : articlesDescription,
    title: `${ARTICLES_TITLE}${pageLabel} | ${metadata.name}`,
    url:
      page > 1
        ? `${metadata.url}${ARTICLES_PATH}?page=${page}`
        : `${metadata.url}${ARTICLES_PATH}`,
  };
}

export async function generateMetadata(
  { searchParams }: { searchParams: Promise<{ page?: string }> },
  _parent: ResolvingMetadata,
): Promise<Metadata> {
  const { page: rawPage } = await searchParams;
  const { description, title, url } = articlesListingMetadata(
    resolveArticlesPage(rawPage),
  );
  const images = [getMarketingOgImage(ARTICLES_PATH, 'Genfeed articles')];

  return {
    alternates: {
      canonical: url,
    },
    description,
    openGraph: {
      description,
      images,
      siteName: metadata.name,
      title,
      type: 'website',
      url,
    },
    title,
    twitter: {
      card: 'summary_large_image',
      description,
      images,
      title,
    },
  };
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const page = resolveArticlesPage(rawPage);
  const articlesPage = await getPublicArticlesPageCached(page);

  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(articlesJsonLd)}
      </script>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <ArticlesList articles={articlesPage.items} pagination={articlesPage} />
      </Suspense>
    </>
  );
}
