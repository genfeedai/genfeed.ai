import type { CreatorRouteProps } from '@props/content/creator.props';
import type { Metadata } from 'next';
import { buildCreatorMetadata } from './creator-metadata';
import { CreatorOverview } from './creator-view';

/**
 * Rendered once and served from the full route cache. A profile build makes
 * seven API calls (brand, referral code, four content lists, model catalog), and
 * crawlers and social unfurls walk the profile index, so rendering on every
 * visit sent each of them to the API. Five minutes keeps a profile edit, a new
 * post or an operator taking the profile off community visible quickly, and
 * collapses repeat visits onto one render. Only `params` is read, which is what
 * lets the route be cached at all: the tab routes read `?page=` and stay dynamic.
 */
export const revalidate = 300;

/**
 * Without `generateStaticParams` Next treats a dynamic-segment route as fully
 * dynamic and answers `no-store`, whatever `revalidate` says. Returning no
 * paths keeps the build free of API calls and turns on rendering on first
 * request, then caching for `revalidate` seconds (the article page does the same).
 */
export const dynamicParams = true;

export function generateStaticParams(): { handle: string }[] {
  return [];
}

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
