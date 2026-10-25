import AssetDeepLink from '@app/(protected)/[orgSlug]/[brandSlug]/library/assets/asset-deep-link';
import {
  IngredientOrigin,
  LibraryPlace,
  PageScope,
} from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import LibraryBrowser from '@pages/library/browser/library-browser';
import { Suspense } from 'react';
import LibraryCreditNotice from '../library-credit-notice';

export const generateMetadata = createPageMetadata('Imported');

const IMPORTED_ORIGINS = [
  IngredientOrigin.UPLOADED,
  IngredientOrigin.IMPORTED,
] as const;

const IMPORTED_PRESET = {
  description:
    'Files you uploaded and posts or pages you imported. Generated output lives in Assets.',
  label: 'Imported',
} as const;

/**
 * Uploads and imports, kept out of Assets so that page is generated output
 * only. It is the same browser with the origin axis seeded, so type, folder,
 * tags and search keep working here.
 */
export default function LibraryImportedPage() {
  return (
    <LibraryBrowser
      place={LibraryPlace.ASSETS}
      preset={IMPORTED_PRESET}
      scope={PageScope.BRAND}
      seededOrigins={IMPORTED_ORIGINS}
    >
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
