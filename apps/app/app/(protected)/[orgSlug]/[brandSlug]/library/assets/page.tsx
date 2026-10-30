import AssetDeepLink from '@app/(protected)/[orgSlug]/[brandSlug]/library/assets/asset-deep-link';
import { LibraryPlace, PageScope } from '@genfeedai/contracts';
import {
  createBrandAppRoute,
  resolveLegacyLibraryRoute,
} from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LibraryBrowser from '@pages/library/browser/library-browser';
import { permanentRedirect } from 'next/navigation';
import { Suspense } from 'react';
import IngredientsList from '@/features/ingredients/list/ingredients-list';
import LibraryCreditNotice from '../library-credit-notice';

export const generateMetadata = createPageMetadata('All assets');

/**
 * The Library's canonical home. Every asset this brand has generated, with
 * type and folder available as filters on top (uploads and imports sit on the
 * References shelf) — the per-type routes are the
 * same page with their chips pre-selected.
 */
export default async function LibraryAssetsPage({
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
  // Old links carried the view in the query (`?place=trash`, `?shelf=…`, a type
  // preset's `?categories=…`); each of those views is a route now.
  const legacyRoute = resolveLegacyLibraryRoute(search);
  if (legacyRoute) {
    permanentRedirect(createBrandAppRoute(orgSlug, brandSlug, legacyRoute));
  }

  return (
    <LibraryBrowser place={LibraryPlace.ASSETS} scope={PageScope.BRAND}>
      <LibraryCreditNotice />
      <Suspense fallback={null}>
        <AssetDeepLink />
        <IngredientsList
          folderNavigation="shell"
          type="ingredients"
          scope={PageScope.BRAND}
        />
      </Suspense>
    </LibraryBrowser>
  );
}
