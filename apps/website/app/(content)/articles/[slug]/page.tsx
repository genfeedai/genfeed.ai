import { stringifyJsonLd } from '@data/json-ld';
import { buildArticleJsonLd } from '@genfeedai/helpers';
import { cdnAsset } from '@helpers/media/cdn/cdn.helper';
import { metadata } from '@helpers/media/metadata/metadata.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { PublicService } from '@services/external/public.service';
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import ArticleDetailContent from './article-detail';
import { getPublicArticleBySlugCached } from './article-loader';

export const dynamic = 'force-dynamic';
export const dynamicParams = true;

/**
 * Ahrefs flags a `<title>` over 63 characters as "Title too long", and Google
 * truncates around the same width. Long headlines used to get the site suffix
 * appended unconditionally, which pushed the Show HN / Product Hunt article to
 * 77 characters. Drop the suffix before it overflows, then trim on a word
 * boundary if the headline alone still exceeds the budget.
 */
const TITLE_MAX_LENGTH = 63;

export function buildArticlePageTitle(articleTitle: string): string {
  const suffixed = `${articleTitle} | ${metadata.name}`;

  if (suffixed.length <= TITLE_MAX_LENGTH) {
    return suffixed;
  }

  if (articleTitle.length <= TITLE_MAX_LENGTH) {
    return articleTitle;
  }

  const clipped = articleTitle.slice(0, TITLE_MAX_LENGTH - 1);
  const lastSpace = clipped.lastIndexOf(' ');

  return `${(lastSpace > 0 ? clipped.slice(0, lastSpace) : clipped).trimEnd()}…`;
}

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
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const article = await getPublicArticleBySlugCached(slug);

  if (!article || article?.id === 'undefined') {
    return {
      description: 'The article you are looking for does not exist.',
      title: `Article not found`,
    };
  }

  // Falling back to the shared default card made every article link in a feed
  // look like the same link. `og/route.tsx` composes the article's own artwork
  // with its headline — the raw artwork carries no title, so the card and not
  // the artwork is what gets shared.
  const articleImage = `${EnvironmentService.apps.website}/articles/${slug}/og`;
  // Coerce missing strings so metadata helpers never see undefined values
  // (GENFEED-AI-44: trim/string ops on absent article fields).
  const articleTitle =
    typeof article.label === 'string' && article.label.trim().length > 0
      ? article.label.trim()
      : 'Article';
  const articleDescription =
    typeof article.summary === 'string' && article.summary.trim().length > 0
      ? article.summary.trim()
      : articleTitle;
  const articleUrl = `${EnvironmentService.apps.website}/articles/${slug}`;

  return {
    alternates: {
      canonical: articleUrl,
    },
    description: articleDescription,
    openGraph: {
      description: articleDescription,
      images: {
        alt: articleTitle,
        height: 630,
        type: 'image/png',
        url: articleImage,
        width: 1200,
      },
      siteName: metadata.name,
      title: articleTitle,
      type: 'article',
      url: articleUrl,
      ...(article.createdAt && { publishedTime: article.createdAt }),
      ...(article.updatedAt && { modifiedTime: article.updatedAt }),
    },
    title: buildArticlePageTitle(articleTitle),
    twitter: {
      card: 'summary_large_image',
      creator: '@genfeedai',
      description: articleDescription,
      images: [articleImage],
      title: articleTitle,
    },
  };
}

export default async function ArticleDetail({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ previewToken?: string }>;
}) {
  const { slug } = await params;
  const { previewToken } = await searchParams;
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

  const articleJsonLd = buildArticleJsonLd({
    author:
      typeof article.author === 'string' && article.author.trim().length > 0
        ? article.author.trim()
        : {
            name: 'Genfeed',
            url: 'https://genfeed.ai',
          },
    body: typeof article.content === 'string' ? article.content : undefined,
    dateModified: article.updatedAt || article.createdAt,
    datePublished: article.publishedAt || article.createdAt,
    description:
      typeof article.summary === 'string' ? article.summary : undefined,
    headline:
      typeof article.label === 'string' && article.label.trim().length > 0
        ? article.label.trim()
        : 'Article',
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
        name: article.label,
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
            author: article.author,
            readingTime: article.readingTime,
            wordCount: article.wordCount,
          }),
        )}
        isPreview={isPreview}
      />
    </>
  );
}
