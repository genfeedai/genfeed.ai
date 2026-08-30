'use client';

import { PageScope } from '@genfeedai/enums';
import { useElementsContext } from '@providers/elements/elements.context';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import CameraMovementsList from './camera-movements-list';

export default function CameraMovementsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<PageLoadingState />}>
      <CameraMovementsList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
