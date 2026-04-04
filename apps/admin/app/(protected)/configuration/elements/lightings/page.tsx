'use client';

import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import LightingsList from '@pages/elements/lightings/lightings-list';
import { useElementsContext } from '@providers/elements/elements.provider';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export default function LightingsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <LightingsList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
