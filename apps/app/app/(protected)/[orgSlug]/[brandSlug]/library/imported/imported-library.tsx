'use client';

import AssetDeepLink from '@app/(protected)/[orgSlug]/[brandSlug]/library/assets/asset-deep-link';
import {
  IngredientOrigin,
  LibraryPlace,
  PageScope,
} from '@genfeedai/contracts';
import LibraryBrowser from '@pages/library/browser/library-browser';
import { useTranslations } from 'next-intl';
import { Suspense } from 'react';
import IngredientsList from '@/features/ingredients/list/ingredients-list';
import LibraryCreditNotice from '../library-credit-notice';

const IMPORTED_ORIGINS = [
  IngredientOrigin.UPLOADED,
  IngredientOrigin.IMPORTED,
] as const;

/**
 * Uploads and imports, kept out of Assets so that page is generated output
 * only. It is the same browser with the origin axis seeded, so type, folder,
 * tags and search keep working here.
 */
export default function ImportedLibrary() {
  const translate = useTranslations('pages.library.imported');

  return (
    <LibraryBrowser
      place={LibraryPlace.ASSETS}
      preset={{
        label: translate('label'),
      }}
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
