import { buildArticleMarkdown } from '@data/article-markdown';
import { creatorArticlePath } from '@genfeedai/contracts/constants';
import type { PublicArticleRouteProps } from '@props/content/public-article.props';
import { EnvironmentService } from '@services/core/environment.service';
import { getPublicBrandBySlug } from '../../../creator-loader';
import { resolvePublicArticleAuthor } from '../article-author';
import { getCreatorArticleCached } from '../article-loader';

/**
 * The Markdown copy of a public article, served at `/@handle/articles/slug.md`
 * and at the article URL itself for a client that asks for `text/markdown`
 * (`next.config.ts` rewrites both here). Agents get the words and a short brief
 * without parsing the page. Cached like the page it mirrors: a corrected
 * article reaches agents within five minutes.
 */
export const revalidate = 300;

const CONTENT_SIGNAL = 'ai-train=no, search=yes, ai-input=yes';

export async function GET(
  _request: Request,
  { params }: PublicArticleRouteProps,
): Promise<Response> {
  const { handle: requestedHandle, slug } = await params;
  const article = await getCreatorArticleCached(requestedHandle, slug);

  // A missing article, or one filed under another creator, is a real 404.
  if (!article) {
    return new Response('Article not found\n', {
      headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      status: 404,
    });
  }

  const handle = requestedHandle.toLowerCase();
  const brand = await getPublicBrandBySlug(handle).catch(() => null);
  const articleUrl = `${EnvironmentService.apps.website}${creatorArticlePath(handle, slug)}`;
  const markdown = buildArticleMarkdown({
    articleUrl,
    authorName: resolvePublicArticleAuthor(article),
    brandName: brand?.label?.trim() || `@${handle}`,
    contentHtml: typeof article.content === 'string' ? article.content : '',
    isPaid: article.accessLevel === 'paid',
    markdownUrl: `${articleUrl}.md`,
    publishedAt: article.publishedAt,
    summary: typeof article.summary === 'string' ? article.summary : '',
    tags: article.tags?.map((tag) =>
      typeof tag?.label === 'string' ? tag.label : undefined,
    ),
    title: typeof article.label === 'string' ? article.label : '',
    updatedAt: article.updatedAt || article.createdAt,
  });

  return new Response(markdown, {
    headers: {
      'Cache-Control': 'public, max-age=300, stale-while-revalidate=86400',
      'Content-Signal': CONTENT_SIGNAL,
      'Content-Type': 'text/markdown; charset=utf-8',
      Link: `<${articleUrl}>; rel="canonical"`,
      Vary: 'Accept',
      'X-Markdown-Tokens': String(Math.ceil(markdown.length / 4)),
    },
  });
}
