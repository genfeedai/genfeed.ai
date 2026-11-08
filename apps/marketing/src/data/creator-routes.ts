/**
 * Creators live at `genfeed.ai/@<handle>`. App Router reads a folder named
 * `@x` as a parallel-route slot, so the pages sit in `app/creator-profile`
 * and these rewrites serve them under the handle. The handle segment follows
 * `BRAND_HANDLE_PATTERN`; anything else falls through to the 404 page.
 */
const HANDLE_SEGMENT = ':handle([a-z0-9]+(?:-[a-z0-9]+)*)';

export const CREATOR_PROFILE_ROUTE_PREFIX = '/creator-profile';

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

/**
 * Until creator handles, genfeed.ai only hosted Genfeed's own articles, at
 * `/articles/<slug>`. Those addresses are indexed and linked from published
 * articles, so they move permanently to the @genfeedai profile.
 */
export const LEGACY_ARTICLE_REDIRECTS = [
  {
    destination: '/@genfeedai/articles/:slug/:path*',
    permanent: true,
    source: '/articles/:slug/:path*',
  },
];
