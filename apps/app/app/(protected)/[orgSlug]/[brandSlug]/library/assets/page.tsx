import { LibraryPlace, PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import LibraryBrowser from '@pages/library/browser/library-browser';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import LibraryCreditNotice from '../library-credit-notice';

export const generateMetadata = createPageMetadata('All assets');

/**
 * The Library's canonical home. Every asset this brand has generated, with
 * type and folder available as filters on top — the per-type routes are the
 * same page with their chips pre-selected.
 */
export default function LibraryAssetsPage() {
  return (
    <LibraryBrowser place={LibraryPlace.ASSETS} scope={PageScope.BRAND}>
      <LibraryCreditNotice />
      <Suspense fallback={<PageLoadingState />}>
        <IngredientsList
          folderNavigation="shell"
          type="ingredients"
          scope={PageScope.BRAND}
        />
      </Suspense>
    </LibraryBrowser>
  );
}
