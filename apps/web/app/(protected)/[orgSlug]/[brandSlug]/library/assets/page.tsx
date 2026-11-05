import AssetDeepLink from '@app/(protected)/[orgSlug]/[brandSlug]/library/assets/asset-deep-link';
import LegacyLibraryQueryRedirect from '@app/(protected)/[orgSlug]/[brandSlug]/library/assets/legacy-library-query-redirect';
import { LibraryPlace, PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import { IngredientsMediaGridSkeleton } from '@/components/ingredients/list/media-grid/IngredientsMediaGrid';
import IngredientsList from '@/features/ingredients/list/ingredients-list';
import LibraryBrowser from '@/features/library/browser/library-browser';
import type { LegacyLibraryQueryRedirectProps } from '@/features/library/props/legacy-library-query-redirect.props';
import LibraryCreditNotice from '../library-credit-notice';

export const generateMetadata = createPageMetadata('All assets');

/**
 * The Library's canonical home. Every asset this brand has generated, with
 * type and folder available as filters on top (uploads and imports sit on the
 * References shelf) — the per-type routes are the
 * same page with their chips pre-selected.
 *
 * The page itself reads no request data, so the browser frame is part of the
 * prerendered route shell and the Library rail click paints it at once. Only
 * the legacy-query redirect reads the URL, inside its own Suspense boundary.
 */
export default function LibraryAssetsPage({
  params,
  searchParams,
}: LegacyLibraryQueryRedirectProps) {
  return (
    <LibraryBrowser place={LibraryPlace.ASSETS} scope={PageScope.BRAND}>
      <Suspense fallback={null}>
        <LegacyLibraryQueryRedirect
          params={params}
          searchParams={searchParams}
        />
      </Suspense>
      <LibraryCreditNotice />
      <Suspense fallback={<IngredientsMediaGridSkeleton />}>
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
