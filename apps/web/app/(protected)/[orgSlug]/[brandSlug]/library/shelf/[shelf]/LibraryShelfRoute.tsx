'use client';

import { PageScope, parseLibraryShelf } from '@genfeedai/contracts';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { IngredientsMediaGridSkeleton } from '@/components/ingredients/list/media-grid/IngredientsMediaGrid';
import IngredientsList from '@/features/ingredients/list/ingredients-list';
import LibraryBrowser from '@/features/library/browser/library-browser';
import { readRouteParam } from '@/lib/route-params';

/**
 * A shelf is a saved query over generation state, not a location — the same
 * asset moves between shelves on its own as it renders and gets reviewed, while
 * its folder only changes when a human moves it. An unknown segment is a 404
 * rather than a silent fallback to "everything", which would quietly show the
 * operator a different set than the URL promises.
 *
 * Reads the shelf on the client, so the page is part of the prerendered route
 * shell and a click on a shelf paints at once instead of waiting for a server
 * render. The shell itself, rendered before the shelf is known, is the grid
 * skeleton.
 */
export default function LibraryShelfRoute() {
  const params = useRouteParams<{ shelf?: string | string[] }>();
  const segment = readRouteParam(params.shelf);
  const shelf = segment ? parseLibraryShelf(segment) : undefined;

  if (segment && !shelf) {
    notFound();
  }

  if (!shelf) {
    return <IngredientsMediaGridSkeleton />;
  }

  return (
    <LibraryBrowser shelf={shelf} scope={PageScope.BRAND}>
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
