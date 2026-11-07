import {
  isProtectedAppsRoute,
  isProtectedConversationRoute,
  isProtectedEditorCanvasRoute,
} from '@/components/layouts/protected/protected-route-kind';
import {
  getStudioAppForPath,
  STUDIO_APP_MENU_ITEMS,
} from '@/config/studio-menu-items.config';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';

/**
 * Whether the loading frame draws a menu column. It follows the routes where
 * the real shell drops its module menu (the agent conversation, editor
 * canvases, Apps and single-page Studio apps), so the column does not appear
 * only to vanish once the workspace is confirmed.
 */
export function hasWorkspaceSkeletonSidebar(rawPathname: string): boolean {
  if (isProtectedAppsRoute(rawPathname)) {
    return false;
  }

  const pathname = normalizeProtectedPathname(rawPathname);
  const studioApp = getStudioAppForPath(pathname);
  if (studioApp && STUDIO_APP_MENU_ITEMS[studioApp].length <= 1) {
    return false;
  }

  return (
    !isProtectedConversationRoute(pathname) &&
    !isProtectedEditorCanvasRoute(pathname)
  );
}
