'use client';

import { PageScope } from '@genfeedai/contracts';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import IngredientsList from '@pages/ingredients/list/ingredients-list';
import LibraryBrowser from '@pages/library/browser/library-browser';
import { findLibraryTypePresetBySegment } from '@pages/library/browser/library-browser.config';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { readRouteParam } from '@/lib/route-params';

/**
 * The admin Library: the in-app `LibraryBrowser` across every organization.
 * The type is a path view (`/admin/content/ingredients/images`) like
 * `/library/images`; organization, brand, search and the other filters are
 * query params.
 */
export default function IngredientsListRoute() {
  const params = useRouteParams<{ type?: string | string[] }>();
  const type = readRouteParam(params?.type);
  const preset = type ? findLibraryTypePresetBySegment(type) : undefined;

  if (type && !preset) {
    notFound();
  }

  return (
    <LibraryBrowser
      preset={preset}
      scope={PageScope.SUPERADMIN}
      seededCategories={preset?.categories}
    >
      <Suspense fallback={null}>
        <IngredientsList
          folderNavigation="shell"
          scope={PageScope.SUPERADMIN}
          type="ingredients"
        />
      </Suspense>
    </LibraryBrowser>
  );
}
