import type { ICreatorArticleAccess } from '@genfeedai/contracts/interfaces/billing';
import { createMarkup } from '@genfeedai/helpers';
import type { ArticleAccessView } from '@props/content/public-article.props';
import { EnvironmentService } from '@services/core/environment.service';
import { getRequestOrganizationHeaders } from '@services/core/interceptor.service';
import { buildArticleSections } from '../article-sections';

export const dynamic = 'force-dynamic';

const BEARER_PREFIX = 'Bearer ';
const PRIVATE_HEADERS = { 'Cache-Control': 'private, no-store' };

/**
 * A paid article's full body for a signed-in reader (#9718). The browser sends
 * the reader's own token; the API decides access, and the body is sanitized
 * and outlined here on the server, like the public article, so the sanitizer
 * never ships to the browser.
 */
export async function GET(request: Request): Promise<Response> {
  const authorization = request.headers.get('authorization');
  const articleId = new URL(request.url).searchParams.get('articleId');
  if (!authorization?.startsWith(BEARER_PREFIX) || !articleId) {
    return Response.json(
      { error: 'Sign in to read this article' },
      { headers: PRIVATE_HEADERS, status: 401 },
    );
  }

  const response = await fetch(
    `${EnvironmentService.apiEndpoint}/creator-payments/articles/${encodeURIComponent(articleId)}`,
    {
      cache: 'no-store',
      headers: {
        Authorization: authorization,
        ...getRequestOrganizationHeaders(),
      },
    },
  );
  if (!response.ok) {
    return Response.json(
      { error: 'Article access is unavailable' },
      { headers: PRIVATE_HEADERS, status: response.status },
    );
  }

  const { content, ...access } =
    (await response.json()) as ICreatorArticleAccess;
  const view: ArticleAccessView = {
    ...access,
    full:
      access.hasAccess && content
        ? buildArticleSections(createMarkup(content).__html)
        : null,
  };
  return Response.json(view, { headers: PRIVATE_HEADERS });
}
