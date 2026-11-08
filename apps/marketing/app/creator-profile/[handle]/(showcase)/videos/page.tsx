import type { CreatorTabRouteProps } from '@props/content/creator.props';
import type { Metadata } from 'next';
import { resolveCreatorPage } from '../creator-loader';
import { buildCreatorMetadata } from '../creator-metadata';
import { CreatorTab } from '../creator-view';

export async function generateMetadata({
  params,
}: CreatorTabRouteProps): Promise<Metadata> {
  const { handle } = await params;
  return await buildCreatorMetadata(handle, 'videos');
}

export default async function CreatorVideosPage({
  params,
  searchParams,
}: CreatorTabRouteProps) {
  const [{ handle }, { page }] = await Promise.all([params, searchParams]);
  return (
    <CreatorTab handle={handle} page={resolveCreatorPage(page)} tab="videos" />
  );
}
