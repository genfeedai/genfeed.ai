import type { CreatorRouteProps } from '@props/content/creator.props';
import type { Metadata } from 'next';
import { buildCreatorMetadata } from './creator-metadata';
import { CreatorOverview } from './creator-view';

/**
 * Rendered on every visit from the API's cache, which a profile edit or an
 * operator taking the profile off community clears, so the change shows on the
 * next load.
 */
export const dynamic = 'force-dynamic';

export async function generateMetadata({
  params,
}: CreatorRouteProps): Promise<Metadata> {
  const { handle } = await params;
  return await buildCreatorMetadata(handle);
}

export default async function CreatorProfilePage({
  params,
}: CreatorRouteProps) {
  const { handle } = await params;
  return <CreatorOverview handle={handle} />;
}
