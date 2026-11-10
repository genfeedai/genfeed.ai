import { derivePageHelpRoutes } from '@/lib/workspace-shell/route-manifest.util';
import type { PageHelpRoute } from '@/props/layout/page-help-route.props';

/**
 * Route prefix → `pages.help.<key>` catalog entry, declared as `help` on a
 * page of the route manifest. Longest prefix wins, so nested pages (e.g.
 * workflows/new) inherit their section help unless listed.
 */
export const PAGE_HELP_ROUTES: PageHelpRoute[] = derivePageHelpRoutes();

/** Drop the `/orgSlug/brandSlug` (or `/orgSlug/~`) prefix from an app path. */
export function stripScopePrefix(pathname: string): string {
  const parts = pathname.split('/').filter(Boolean);
  if (parts.length >= 2) {
    return `/${parts.slice(2).join('/')}`;
  }
  return pathname;
}

export function resolvePageHelpKey(
  pathname: string,
  _search = '',
): string | null {
  const path = stripScopePrefix(pathname);
  let match: PageHelpRoute | null = null;
  for (const route of PAGE_HELP_ROUTES) {
    const isMatch =
      path === route.prefix || path.startsWith(`${route.prefix}/`);
    if (isMatch && (!match || route.prefix.length > match.prefix.length)) {
      match = route;
    }
  }
  return match?.key ?? null;
}
