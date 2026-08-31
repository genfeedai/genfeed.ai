import { APP_ROUTES } from '@genfeedai/constants';
import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import LibraryBrowser from '@pages/library/browser/library-browser';
import { LIBRARY_TYPE_PRESETS } from '@pages/library/browser/library-browser.config';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('GIFs');

const PRESET = LIBRARY_TYPE_PRESETS[APP_ROUTES.LIBRARY.GIFS];

/**
 * A type-seeded preset over the one Library browser, kept as a deep link for
 * the agent, workspace cards and brand settings. Type is a filter, not a
 * destination — so the chips arrive pre-selected and the operator can clear
 * them without leaving the page.
 */
export default function LibraryGifsPage() {
  return (
    <LibraryBrowser
      preset={PRESET}
      scope={PageScope.BRAND}
      seededCategories={PRESET.categories}
    >
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
