import { createBrandAppRoute } from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { redirect } from 'next/navigation';

export const generateMetadata = createPageMetadata('Workspace Inbox');

/**
 * The inbox has no view of its own: `/workspace/inbox` opens the unread view
 * with the filters it was given.
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

  const rest = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (key === 'view' || value === undefined) continue;
    for (const entry of [value].flat()) {
      rest.append(key, entry);
    }
  }
  const query = rest.toString();

  redirect(
    `${createBrandAppRoute(orgSlug, brandSlug, '/workspace/inbox/unread')}${query ? `?${query}` : ''}`,
  );
}
