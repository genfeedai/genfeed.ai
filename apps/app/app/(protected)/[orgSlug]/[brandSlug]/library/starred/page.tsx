import { LibraryPlace, PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import LibraryBrowser from '@pages/library/browser/library-browser';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Starred');

/**
 * The one axis a human sets by hand and nothing else moves. Starring is
 * independent of both shelf and folder.
 */
export default function LibraryStarredPage() {
  return (
    <LibraryBrowser place={LibraryPlace.STARRED} scope={PageScope.BRAND}>
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
