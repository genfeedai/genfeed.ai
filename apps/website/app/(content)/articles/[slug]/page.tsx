import { metadata } from '@helpers/media/metadata/metadata.helper';
import { EnvironmentService } from '@services/core/environment.service';
import { PublicService } from '@services/external/public.service';
import type { Metadata } from 'next';
import ArticleDetailContent from './article-detail';
import { getPublicArticleBySlugCached } from './article-loader';

export const dynamicParams = true;

export async function generateStaticParams(): Promise<{ slug: string }[]> {
  try {
    const articles = await PublicService.getInstance().findPublicArticles({
      limit: 200,
      page: 1,
      sortBy: 'publishedAt',
      sortOrder: 'desc',
    });
    return articles.filter((a) => a.slug).map((a) => ({ slug: a.slug }));
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
  const article = await getPublicArticleBySlugCached(slug, false);

  if (!article || article?.id === 'undefined') {
    return {
      description: 'The article you are looking for does not exist.',
      title: `Article not found`,
    };
  }

  const articleImage = article.bannerUrl || metadata.cards.default;
  const articleTitle = article.label;
  const articleDescription = article.summary;
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
        type: 'image/jpeg',
        url: articleImage,
        width: 1200,
      },
      title: articleTitle,
      type: 'article',
      url: articleUrl,
      ...(article.createdAt && { publishedTime: article.createdAt }),
      ...(article.updatedAt && { modifiedTime: article.updatedAt }),
    },
    title: `${articleTitle} | ${metadata.name}`,
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
  searchParams: Promise<{ isPreview?: string }>;
}) {
  const { slug } = await params;
  const isPreview = (await searchParams).isPreview === 'true';
  const article = await getPublicArticleBySlugCached(slug, isPreview);

  const articleJsonLd =
    article && article.id !== 'undefined'
      ? {
          '@context': 'https://schema.org',
          '@type': 'BlogPosting',
          articleBody: article.content || undefined,
          author: article.author
            ? {
                '@type': 'Person',
                name: article.author,
                worksFor: {
                  '@type': 'Organization',
                  name: 'Genfeed',
                  url: 'https://genfeed.ai',
                },
              }
            : {
                '@type': 'Organization',
                name: 'Genfeed',
                url: 'https://genfeed.ai',
              },
          dateModified: article.updatedAt || article.createdAt,
          datePublished: article.createdAt,
          description: article.summary,
          headline: article.label,
          image: article.bannerUrl || metadata.cards.default,
          inLanguage: 'en-US',
          isPartOf: {
            '@type': 'Blog',
            name: 'Genfeed Blog',
            url: `${EnvironmentService.apps.website}/articles`,
          },
          keywords:
            article.tags && article.tags.length > 0
              ? article.tags.map((t) => t.label).join(', ')
              : undefined,
          mainEntityOfPage: {
            '@id': `${EnvironmentService.apps.website}/articles/${slug}`,
            '@type': 'WebPage',
          },
          publisher: {
            '@type': 'Organization',
            logo: {
              '@type': 'ImageObject',
              url: 'https://cdn.genfeed.ai/assets/logo.png',
            },
            name: 'Genfeed',
            url: 'https://genfeed.ai',
          },
          url: `${EnvironmentService.apps.website}/articles/${slug}`,
          wordCount: article.wordCount || undefined,
        }
      : null;

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
      ...(article && article.id !== 'undefined'
        ? [
            {
              '@type': 'ListItem',
              item: `${EnvironmentService.apps.website}/articles/${slug}`,
              name: article.label,
              position: 3,
            },
          ]
        : []),
    ],
  };

  return (
    <>
      {articleJsonLd ? (
        <script type="application/ld+json">
          {JSON.stringify(articleJsonLd)}
        </script>
      ) : null}
      <script type="application/ld+json">
        {JSON.stringify(breadcrumbJsonLd)}
      </script>
      <ArticleDetailContent
        article={
          article
            ? JSON.parse(
                JSON.stringify({
                  ...article,
                  author: article.author,
                  bannerUrl: article.bannerUrl,
                  readingTime: article.readingTime,
                  wordCount: article.wordCount,
                }),
              )
            : null
        }
        isPreview={isPreview}
      />
    </>
  );
}
