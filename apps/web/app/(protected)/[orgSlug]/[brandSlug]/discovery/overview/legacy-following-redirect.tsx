import { redirect } from 'next/navigation';
import type { DiscoveryOverviewPageProps } from '@/features/trends/props/discovery-desk.props';

/**
 * `?source=following` was the Following view before it had a route of its own.
 * Reading the query makes this part dynamic, so it renders inside its own
 * Suspense boundary and the Discovery desk stays in the prerendered shell.
 */
export default async function LegacyFollowingRedirect({
  params,
  searchParams,
}: DiscoveryOverviewPageProps) {
  const [{ orgSlug, brandSlug }, search] = await Promise.all([
    params,
    searchParams,
  ]);

  if (search.source === 'following') {
    redirect(`/${orgSlug}/${brandSlug ?? '~'}/discovery/following`);
  }

  return null;
}
