import { LibraryPlace, PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import { IngredientsMediaGridSkeleton } from '@/components/ingredients/list/media-grid/IngredientsMediaGrid';
import IngredientsList from '@/features/ingredients/list/ingredients-list';
import LibraryBrowser from '@/features/library/browser/library-browser';

export const generateMetadata = createPageMetadata('Trash');

/**
 * Soft-deleted assets (`isDeleted: true`). Lifecycle, not generation state —
 * which is why Trash is a place and not a shelf.
 */
export default function LibraryTrashPage() {
  return (
    <LibraryBrowser place={LibraryPlace.TRASH} scope={PageScope.BRAND}>
      <Suspense fallback={<IngredientsMediaGridSkeleton />}>
        <IngredientsList
          folderNavigation="shell"
          type="ingredients"
          scope={PageScope.BRAND}
        />
      </Suspense>
    </LibraryBrowser>
  );
}
