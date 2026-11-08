import type { CreatorRouteProps } from '@props/content/creator.props';
import type { Metadata } from 'next';
import { buildCreatorMetadata } from './creator-metadata';
import { CreatorOverview } from './creator-view';

/**
 * Profiles are edited from the app (logo, banner, links), so the cached page
 * must expire on its own; without a window a first render is served until the
 * next deploy.
 */
export const revalidate = 60;

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
