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

/**
 * A repeated `?previewToken` arrives as an array. Rather than forward an
 * ambiguous value to a lookup that expects one token, treat anything but a
 * single string as no token at all — the article then resolves as it would for
 * an anonymous reader.
 */
function readPreviewToken(
  value: string | string[] | undefined,
): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined;
}

export async function generateMetadata({
  params,
  searchParams,
}: PublicArticlePreviewRouteProps): Promise<Metadata> {
  const { slug } = await params;
  const { previewToken } = await searchParams;
  const meta = await buildPublicArticleMetadata(
    slug,
    readPreviewToken(previewToken),
  );

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

  return (
    <ArticleView previewToken={readPreviewToken(previewToken)} slug={slug} />
  );
}
