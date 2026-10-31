import {
  LIBRARY_SHELF_LABELS,
  PageScope,
  parseLibraryShelf,
} from '@genfeedai/contracts';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import IngredientsList from '@/features/ingredients/list/ingredients-list';
import LibraryBrowser from '@/features/library/browser/library-browser';
import type { LibraryShelfPageProps } from '@/features/library/props/library-shelf-page.props';

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
