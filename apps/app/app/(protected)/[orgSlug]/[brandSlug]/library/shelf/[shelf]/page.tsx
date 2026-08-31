import {
  LIBRARY_SHELF_LABELS,
  PageScope,
  parseLibraryShelf,
} from '@genfeedai/enums';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import LibraryBrowser from '@pages/library/browser/library-browser';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';

interface LibraryShelfPageProps {
  params: Promise<{ shelf: string }>;
}

export const generateMetadata = createDynamicPageMetadata('shelf', (value) => {
  const parsed = parseLibraryShelf(value);

  return parsed ? LIBRARY_SHELF_LABELS[parsed] : 'Library';
});

/**
 * A shelf is a saved query over generation state, not a location — the same
 * asset moves between shelves on its own as it renders and gets reviewed, while
 * its folder only changes when a human moves it. An unknown segment is a 404
 * rather than a silent fallback to "everything", which would quietly show the
 * operator a different set than the URL promises.
 */
export default async function LibraryShelfPage({
  params,
}: LibraryShelfPageProps) {
  const { shelf } = await params;
  const parsed = parseLibraryShelf(shelf);

  if (!parsed) {
    notFound();
  }

  return (
    <LibraryBrowser shelf={parsed} scope={PageScope.BRAND}>
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
