import type { PublicArticleRouteProps } from '@props/content/public-article.props';
import { PublicService } from '@services/external/public.service';
import type { Metadata } from 'next';
import { buildPublicArticleMetadata } from './article-metadata';
import ArticleView from './article-view';

/**
 * The public article is the same bytes for every reader, so it is rendered once
 * and served from the full route cache. It used to be `force-dynamic` purely to
 * read a `?previewToken` query, which meant every visitor — and every crawler —
 * paid a fresh API round trip to the backend before the first byte. Preview now
 * lives on its own route (`./preview`), which is the only reason this one can be
 * cached at all: reading `searchParams` opts a route into dynamic rendering
 * regardless of what these exports say.
 *
 * Five minutes keeps a freshly published or corrected article visible quickly
 * while collapsing crawler and social-unfurl traffic onto one render.
 */
export const revalidate = 300;
export const dynamicParams = true;

export { buildArticlePageTitle } from './article-metadata';

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const articles = await PublicService.getInstance().findAllPublicArticles({
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    return articles.reduce<Array<{ slug: string }>>((params, article) => {
      if (article.slug) {
        params.push({ slug: article.slug });
      }

      return params;
    }, []);
  } catch {
    return [];
  }
}

export async function generateMetadata({
  params,
}: PublicArticleRouteProps): Promise<Metadata> {
  const { slug } = await params;

  return await buildPublicArticleMetadata(slug);
}

export default async function ArticleDetail({
  params,
}: PublicArticleRouteProps) {
  const { slug } = await params;

  return <ArticleView slug={slug} />;
}
