import { buildArticleIndexMarkdown } from '@data/article-markdown';
import {
  articleHandle,
  creatorArticlePath,
} from '@genfeedai/contracts/constants';
import { EnvironmentService } from '@services/core/environment.service';
import { PublicService } from '@services/external/public.service';

/**
 * `/llms-articles.txt`: every public article with a link to its Markdown copy
 * and its summary, for agents that start from `llms.txt`. It is rendered from
 * the live public list like `/sitemap.xml`, so a new article shows up within
 * five minutes. When the list cannot be loaded the index is empty rather than
 * an error, and the next revalidation fills it.
 */
export const revalidate = 300;

/** Newest articles only; the sitemap stays the exhaustive list. */
const MAX_INDEXED_ARTICLES = 200;

export async function GET(): Promise<Response> {
  const articles = await PublicService.getInstance()
    .findAllPublicArticles({ sortBy: 'publishedAt', sortOrder: 'desc' })
    .catch(() => []);

  const markdown = buildArticleIndexMarkdown(
    articles
      .filter((article) => Boolean(article.slug))
      .slice(0, MAX_INDEXED_ARTICLES)
      .map((article) => ({
        markdownUrl: `${EnvironmentService.apps.website}${creatorArticlePath(articleHandle(article.brand?.slug), article.slug)}.md`,
        publishedAt: article.publishedAt,
        summary: article.summary,
        title: article.label,
      })),
  );

  return new Response(markdown, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
      'Content-Signal': 'ai-train=no, search=yes, ai-input=yes',
      'Content-Type': 'text/plain; charset=utf-8',
    },
  });
}
