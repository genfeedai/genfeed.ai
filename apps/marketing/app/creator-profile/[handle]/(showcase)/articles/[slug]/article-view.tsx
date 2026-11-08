import { getEditorialArticleCoverUrl } from '@data/editorial-og.data';
import { stringifyJsonLd } from '@data/json-ld';
import {
  creatorArticlePath,
  creatorProfilePath,
} from '@genfeedai/contracts/constants';
import { buildArticleJsonLd } from '@genfeedai/helpers';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';
import type { PublicArticleViewProps } from '@props/content/public-article.props';
import { EnvironmentService } from '@services/core/environment.service';
import { notFound } from 'next/navigation';
import { getPublicBrandBySlug } from '../../creator-loader';
import { resolvePublicArticleAuthor } from './article-author';
import ArticleDetailContent from './article-detail';
import { getCreatorArticleCached } from './article-loader';

/**
 * The rendered article, shared by the cached public route and the dynamic
 * preview route. Only the preview route passes a token, which is what keeps
 * `/@handle/articles/[slug]` free of `searchParams` and therefore statically
 * renderable.
 */
export default async function ArticleView({
  handle: requestedHandle,
  previewToken,
  slug,
}: PublicArticleViewProps) {
  const article = await getCreatorArticleCached(
    requestedHandle,
    slug,
    previewToken,
  );

  // A missing article, or one filed under another creator, is a real 404:
  // a soft 404 lets crawlers index an empty shell.
  if (!article) {
    notFound();
  }

  const handle = requestedHandle.toLowerCase();
  const brand = await getPublicBrandBySlug(handle).catch(() => null);
  const articlePath = creatorArticlePath(handle, slug);
  const articleUrl = `${EnvironmentService.apps.website}${articlePath}`;
  const profileUrl = `${EnvironmentService.apps.website}${creatorProfilePath(handle)}`;
  const brandName = brand?.label?.trim() || 'Genfeed';

  // The API only hands back an unpublished article when it accepted the token,
  // so the article itself — not the query string — decides whether to warn the
  // reader that this is not live yet.
  const isPreview = !article.publishedAt;
  const authorLabel = resolvePublicArticleAuthor(article);
  // `name` is required on both the Article headline and every BreadcrumbList
  // item, so guard the label once and reuse it — an undefined `name` is dropped
  // by JSON.stringify and silently invalidates the structured data.
  const headline =
    typeof article.label === 'string' && article.label.trim().length > 0
      ? article.label.trim()
      : 'Article';

  const articleJsonLd = buildArticleJsonLd({
    author: authorLabel ?? {
      name: brandName,
      url: profileUrl,
    },
    body: typeof article.content === 'string' ? article.content : undefined,
    dateModified: article.updatedAt || article.createdAt,
    datePublished: article.publishedAt || article.createdAt,
    description:
      typeof article.summary === 'string' ? article.summary : undefined,
    headline,
    // The artwork first — it is the article's own image — then the composed
    // social card, which is what a share preview actually renders.
    imageUrls: [
      getEditorialArticleCoverUrl(slug, article.coverImageUrl),
      `${articleUrl}/og`,
    ],
    inLanguage: 'en-US',
    keywords: article.tags
      ?.map((tag) => (typeof tag?.label === 'string' ? tag.label : undefined))
      .filter((label): label is string => Boolean(label)),
    mainEntityUrl: articleUrl,
    publisher: {
      logoUrl: cdnAsset('/assets/branding/logo.jpg'),
      name: 'Genfeed',
      url: 'https://genfeed.ai',
    },
    url: articleUrl,
    wordCount: article.wordCount || undefined,
  });

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
        item: profileUrl,
        name: `@${handle}`,
        position: 2,
      },
      {
        '@type': 'ListItem',
        item: `${profileUrl}/articles`,
        name: 'Articles',
        position: 3,
      },
      {
        '@type': 'ListItem',
        item: articleUrl,
        name: headline,
        position: 4,
      },
    ],
  };

  return (
    <>
      <script type="application/ld+json">
        {stringifyJsonLd(articleJsonLd)}
      </script>
      <script type="application/ld+json">
        {stringifyJsonLd(breadcrumbJsonLd)}
      </script>
      <ArticleDetailContent
        article={JSON.parse(
          JSON.stringify({
            ...article,
            author: authorLabel,
            readingTime: article.readingTime,
            wordCount: article.wordCount,
          }),
        )}
        brand={brand}
        handle={handle}
        isPreview={isPreview}
      />
    </>
  );
}
