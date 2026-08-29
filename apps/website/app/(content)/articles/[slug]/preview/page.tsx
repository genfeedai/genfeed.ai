import type { PublicArticlePreviewRouteProps } from '@props/content/public-article.props';
import type { Metadata } from 'next';
import { buildPublicArticleMetadata } from '../article-metadata';
import ArticleView from '../article-view';

/**
 * Unpublished drafts, reachable only with a token the API issues. It is split
 * off `/articles/[slug]` so that route never touches `searchParams` and can be
 * statically rendered; keeping both on one URL forced every public reader
 * through a dynamic render.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
  searchParams,
}: PublicArticlePreviewRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const { previewToken } = await searchParams;
  const meta = await buildPublicArticleMetadata(slug, previewToken);

  // A draft must never enter an index, and its canonical is the public URL it
  // will occupy once published.
  return {
    ...meta,
    robots: { follow: false, index: false },
  };
}

export default async function ArticlePreview({
  params,
  searchParams,
}: PublicArticlePreviewRouteProps) {
  const { slug } = await params;
  const { previewToken } = await searchParams;

  return <ArticleView previewToken={previewToken} slug={slug} />;
}
