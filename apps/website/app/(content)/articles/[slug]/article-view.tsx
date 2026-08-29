import { stringifyJsonLd } from '@data/json-ld';
import { buildArticleJsonLd } from '@genfeedai/helpers';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';
import type { PublicArticleViewProps } from '@props/content/public-article.props';
import { EnvironmentService } from '@services/core/environment.service';
import { notFound } from 'next/navigation';
import { resolvePublicArticleAuthor } from './article-author';
import ArticleDetailContent from './article-detail';
import { getPublicArticleBySlugCached } from './article-loader';

/**
 * The rendered article, shared by the cached public route and the dynamic
 * preview route. Only the preview route passes a token, which is what keeps
 * `/articles/[slug]` free of `searchParams` and therefore statically
 * renderable.
 */
export default async function ArticleView({
  previewToken,
  slug,
}: PublicArticleViewProps) {
  const article = await getPublicArticleBySlugCached(slug, previewToken);

  // generateMetadata already titles this "Article not found", but the page used
  // to render a null article with a 200 — a soft 404 that lets crawlers index
  // an empty shell. Answer with a real 404 instead.
  if (!article || article.id === 'undefined') {
    notFound();
  }

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
      name: 'Genfeed',
      url: 'https://genfeed.ai',
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
      article.coverImageUrl,
      `${EnvironmentService.apps.website}/articles/${slug}/og`,
    ],
    inLanguage: 'en-US',
    keywords: article.tags
      ?.map((tag) => (typeof tag?.label === 'string' ? tag.label : undefined))
      .filter((label): label is string => Boolean(label)),
    mainEntityUrl: `${EnvironmentService.apps.website}/articles/${slug}`,
    publisher: {
      logoUrl: cdnAsset('/assets/branding/logo.jpg'),
      name: 'Genfeed',
      url: 'https://genfeed.ai',
    },
    url: `${EnvironmentService.apps.website}/articles/${slug}`,
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
        item: 'https://genfeed.ai/articles',
        name: 'Articles',
        position: 2,
      },
      {
        '@type': 'ListItem',
        item: `${EnvironmentService.apps.website}/articles/${slug}`,
        name: headline,
        position: 3,
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
        isPreview={isPreview}
      />
    </>
  );
}
