import {
  createBrandAppRoute,
  resolveLegacyLibraryRoute,
} from '@genfeedai/contracts/constants';
import { permanentRedirect } from 'next/navigation';
import type { LegacyLibraryQueryRedirectProps } from '@/features/library/props/legacy-library-query-redirect.props';

/**
 * Old links carried the view in the query (`?place=trash`, `?shelf=…`, a type
 * preset's `?categories=…`); each of those views is a route now. Reading the
 * query makes this part dynamic, so it renders inside its own Suspense
 * boundary: the rest of the page stays in the prerendered shell and a click
 * on the Library rail paints at once instead of waiting for the server.
 */
export default async function LegacyLibraryQueryRedirect({
  params,
  searchParams,
}: LegacyLibraryQueryRedirectProps) {
  const [{ brandSlug, orgSlug }, search] = await Promise.all([
    params,
    searchParams,
  ]);
  const legacyRoute = resolveLegacyLibraryRoute(search);

  if (legacyRoute) {
    permanentRedirect(createBrandAppRoute(orgSlug, brandSlug, legacyRoute));
  }

  return null;
}
