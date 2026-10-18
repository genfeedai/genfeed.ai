import { APP_ROUTES } from '@genfeedai/contracts/constants';

function isRouteOrChild(pathname: string, route: string): boolean {
  return pathname === route || pathname.startsWith(`${route}/`);
}

/**
 * Routes whose primary surface is a full prompt bar. Product-page agent chrome
 * must not add another prompt bar or chat bubble there.
 *
 * Matching is by what a route renders, not by its section: Studio's Turbo and
 * Editor routes and the long-form `/edit` editors have no prompt bar, and the
 * Clips and Storyboard run lists only link to the routes that do.
 */
export function isMajorPromptBarHost(normalizedPathname: string): boolean {
  return (
    isRouteOrChild(normalizedPathname, APP_ROUTES.STUDIO.PLAYGROUND) ||
    isRouteOrChild(normalizedPathname, APP_ROUTES.STUDIO.MOTION) ||
    // Children only: `/studio/clips` and `/studio/storyboard` are run lists,
    // while `/new` and `/:id` open the source or brief composer.
    normalizedPathname.startsWith(`${APP_ROUTES.STUDIO.CLIPS}/`) ||
    normalizedPathname.startsWith(`${APP_ROUTES.STUDIO.STORYBOARD}/`) ||
    // Children only: `/publishing/posts` is the Posts desk list; a post page
    // docks the post composer bar.
    normalizedPathname.startsWith(`${APP_ROUTES.PUBLISHING.POSTS}/`)
  );
}
