import { LibraryPlace, PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import LibraryBrowser from '@pages/library/browser/library-browser';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Trash');

/**
 * Soft-deleted assets (`isDeleted: true`). Lifecycle, not generation state —
 * which is why Trash is a place and not a shelf.
 */
export default function LibraryTrashPage() {
  return (
    <LibraryBrowser place={LibraryPlace.TRASH} scope={PageScope.BRAND}>
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
