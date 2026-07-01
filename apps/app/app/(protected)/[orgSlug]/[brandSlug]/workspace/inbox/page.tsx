import { redirect } from 'next/navigation';

// Bare `/workspace/inbox` has no view segment and would 404. The inbox surface
// lives under `[view]` (all | recent | unread); default to the unread view so
// the route (and any stale/bookmarked link to the index) lands on a real page.
export default async function WorkspaceInboxIndexPage({
  params,
}: {
  params: Promise<{ orgSlug: string; brandSlug: string }>;
}) {
  const { orgSlug, brandSlug } = await params;

  redirect(`/${orgSlug}/${brandSlug}/workspace/inbox/unread`);
}
