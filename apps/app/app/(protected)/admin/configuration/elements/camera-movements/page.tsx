'use client';

import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import { useElementsContext } from '@providers/elements/elements.provider';
import { Suspense } from 'react';
import CameraMovementsList from './camera-movements-list';

export default function CameraMovementsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <CameraMovementsList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
