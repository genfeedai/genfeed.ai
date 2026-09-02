import { LibraryPlace, PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import LibraryBrowser from '@pages/library/browser/library-browser';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Recent');

/**
 * Recency is a sort, not a separate store — this is the same browser ordered
 * by `updatedAt` so agent activity surfaces first.
 */
export default function LibraryRecentPage() {
  return (
    <LibraryBrowser place={LibraryPlace.RECENT} scope={PageScope.BRAND}>
      <Suspense fallback={null}>
        <IngredientsList
          folderNavigation="shell"
          type="ingredients"
          scope={PageScope.BRAND}
        />
      </Suspense>
    </LibraryBrowser>
  );
}
