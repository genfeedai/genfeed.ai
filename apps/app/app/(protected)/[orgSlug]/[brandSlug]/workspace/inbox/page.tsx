import { createBrandAppRoute } from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { permanentRedirect, redirect } from 'next/navigation';

export const generateMetadata = createPageMetadata('Workspace Inbox');

const INBOX_VIEWS = new Set(['all', 'recent', 'unread']);

/**
 * The inbox has no view of its own: `/workspace/inbox` opens the unread view,
 * and an old `?view=` link moves to the matching `/workspace/inbox/<view>`
 * path with its remaining filters intact.
 */
export default async function WorkspaceInboxPage({
  params,
  searchParams,
}: {
  params: Promise<{ brandSlug: string; orgSlug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const [{ brandSlug, orgSlug }, search] = await Promise.all([
    params,
    searchParams,
  ]);
  const legacyViews = [search.view ?? []].flat();
  const requestedView = legacyViews.length === 1 ? legacyViews[0] : undefined;
  const view =
    requestedView && INBOX_VIEWS.has(requestedView) ? requestedView : 'unread';

  const rest = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (key === 'view' || value === undefined) continue;
    for (const entry of [value].flat()) {
      rest.append(key, entry);
    }
  }
  const query = rest.toString();
  const destination = `${createBrandAppRoute(orgSlug, brandSlug, `/workspace/inbox/${view}`)}${query ? `?${query}` : ''}`;

  if (legacyViews.length > 0) {
    permanentRedirect(destination);
  }
  redirect(destination);
}
