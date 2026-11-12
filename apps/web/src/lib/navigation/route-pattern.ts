import { normalizeAnalyticsPathname } from '@/lib/analytics/analytics-url';
import { resolveWorkspaceShellRoute } from '@/lib/workspace-shell/workspace-shell-registry';

/**
 * Turn a URL into the route pattern it was served by, with every dynamic
 * segment replaced by its parameter name (`/:orgSlug/:brandSlug/publishing/posts/:id`).
 * The query string, hash and origin are dropped, so no organization slug,
 * brand slug or record id can leave the browser through the result.
 *
 * The workspace shell route inventory is the source of the pattern. A path the
 * inventory does not list falls back to the analytics normalizer, which fails
 * closed on tenant slugs and opaque ids.
 */
export function toRoutePattern(url: string, baseHref: string): string {
  let pathname: string;

  try {
    pathname = new URL(url, baseHref).pathname;
  } catch {
    return '/';
  }

  return (
    resolveWorkspaceShellRoute(pathname)?.canonicalUrl ??
    normalizeAnalyticsPathname(pathname)
  );
}
