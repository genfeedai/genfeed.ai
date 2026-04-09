'use client';

import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import { useElementsContext } from '@providers/elements/elements.provider';
import { Suspense } from 'react';
import LensesList from './lenses-list';

export default function LensesPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <LensesList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
