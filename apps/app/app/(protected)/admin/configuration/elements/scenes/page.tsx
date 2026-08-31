'use client';

import { PageScope } from '@genfeedai/enums';
import { useElementsContext } from '@providers/elements/elements.context';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import ScenesList from './scenes-list';

export default function ScenesPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<PageLoadingState />}>
      <ScenesList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
