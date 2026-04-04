import { metadata } from '@helpers/media/metadata/metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import type { Metadata, ResolvingMetadata } from 'next';
import { Suspense } from 'react';
import ArticlesList from './articles-list';
import { getPublicArticlesPageCached } from './articles-loader';

const articlesDescription =
  'Discover insights, tutorials, and case studies about AI-powered content creation and digital marketing strategies.';

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
  url: `${metadata.url}/articles`,
};

export async function generateMetadata(
  _params: unknown,
  parent: ResolvingMetadata,
): Promise<Metadata> {
  const previousImages = (await parent).openGraph?.images || [];
  const images = [...previousImages];

  return {
    alternates: {
      canonical: `${metadata.url}/articles`,
    },
    description: articlesDescription,
    openGraph: {
      description: articlesDescription,
      images,
      title: `${metadata.name} | Articles & Blog`,
      url: `${metadata.url}/articles`,
    },
    title: `${metadata.name} | Articles & Blog`,
    twitter: {
      description: articlesDescription,
      images,
      title: `${metadata.name} | Articles & Blog`,
    },
  };
}

export default async function ArticlesPage({
  searchParams,
}: {
  searchParams: Promise<{ page?: string }>;
}) {
  const { page: rawPage } = await searchParams;
  const parsedPage = Number.parseInt(rawPage ?? '1', 10);
  const page = Number.isFinite(parsedPage) && parsedPage > 0 ? parsedPage : 1;
  const articles = await getPublicArticlesPageCached(page);

  return (
    <>
      <script type="application/ld+json">
        {JSON.stringify(articlesJsonLd)}
      </script>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <ArticlesList articles={articles} />
      </Suspense>
    </>
  );
}
