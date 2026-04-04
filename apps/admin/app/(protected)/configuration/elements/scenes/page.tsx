'use client';

import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import ScenesList from '@pages/elements/scenes/scenes-list';
import { useElementsContext } from '@providers/elements/elements.provider';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export default function ScenesPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ScenesList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
