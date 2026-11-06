import {
  isProtectedAppsRoute,
  isProtectedConversationRoute,
  isProtectedEditorCanvasRoute,
} from '@/components/layouts/protected/protected-route-kind';
import { normalizeProtectedPathname } from '@/lib/navigation/operator-shell';

/**
 * Whether the loading frame draws a menu column. It follows the routes where
 * the real shell drops its module menu (the agent conversation, editor
 * canvases and Apps), so the column does not appear only to vanish once the
 * workspace is confirmed.
 */
export function hasWorkspaceSkeletonSidebar(rawPathname: string): boolean {
  if (isProtectedAppsRoute(rawPathname)) {
    return false;
  }

  const pathname = normalizeProtectedPathname(rawPathname);
  return (
    !isProtectedConversationRoute(pathname) &&
    !isProtectedEditorCanvasRoute(pathname)
  );
}
