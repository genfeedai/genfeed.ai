import { LibraryPlace, PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import LibraryBrowser from '@pages/library/browser/library-browser';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Starred');

/** The assets you marked worth coming back to. A place over the one Library browser, not a shelf. */
export default function LibraryStarredPage() {
  return (
    <LibraryBrowser place={LibraryPlace.STARRED} scope={PageScope.BRAND}>
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
