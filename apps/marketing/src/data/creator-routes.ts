/**
 * Creators live at `genfeed.ai/@<handle>`. App Router reads a folder named
 * `@x` as a parallel-route slot, so the pages sit in `app/creator-profile`
 * and these rewrites serve them under the handle. The handle segment follows
 * `BRAND_HANDLE_PATTERN`; anything else falls through to the 404 page.
 */
const HANDLE_SEGMENT = ':handle([a-z0-9]+(?:-[a-z0-9]+)*)';

export const CREATOR_PROFILE_ROUTE_PREFIX = '/creator-profile';

const ARTICLE_SLUG_SEGMENT = ':slug([a-z0-9]+(?:-[a-z0-9]+)*)';

/**
 * The Markdown copy of an article (`markdown/route.ts`), reached at
 * `/@handle/articles/slug.md` or at the article URL by a client that sends
 * `Accept: text/markdown`. These must run before the catch-all below.
 */
export const CREATOR_ARTICLE_MARKDOWN_REWRITES = [
  {
    destination: `${CREATOR_PROFILE_ROUTE_PREFIX}/:handle/articles/:slug/markdown`,
    source: `/@${HANDLE_SEGMENT}/articles/${ARTICLE_SLUG_SEGMENT}.md`,
  },
  {
    destination: `${CREATOR_PROFILE_ROUTE_PREFIX}/:handle/articles/:slug/markdown`,
    has: [
      {
        key: 'accept',
        type: 'header' as const,
        value: '.*text/markdown.*',
      },
    ],
    source: `/@${HANDLE_SEGMENT}/articles/${ARTICLE_SLUG_SEGMENT}`,
  },
];

export const CREATOR_PROFILE_REWRITES = [
  {
    destination: `${CREATOR_PROFILE_ROUTE_PREFIX}/:handle`,
    source: `/@${HANDLE_SEGMENT}`,
  },
  {
    destination: `${CREATOR_PROFILE_ROUTE_PREFIX}/:handle/:path*`,
    source: `/@${HANDLE_SEGMENT}/:path*`,
  },
];
