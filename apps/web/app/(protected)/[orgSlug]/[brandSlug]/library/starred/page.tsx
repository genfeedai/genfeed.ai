import { LibraryPlace, PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import { IngredientsMediaGridSkeleton } from '@/components/ingredients/list/media-grid/IngredientsMediaGrid';
import IngredientsList from '@/features/ingredients/list/ingredients-list';
import LibraryBrowser from '@/features/library/browser/library-browser';

export const generateMetadata = createPageMetadata('Starred');

/** The assets you marked worth coming back to. A place over the one Library browser, not a shelf. */
export default function LibraryStarredPage() {
  return (
    <LibraryBrowser place={LibraryPlace.STARRED} scope={PageScope.BRAND}>
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
