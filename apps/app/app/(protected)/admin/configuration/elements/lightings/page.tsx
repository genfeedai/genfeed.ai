'use client';

import { PageScope } from '@genfeedai/enums';
import { useElementsContext } from '@providers/elements/elements.context';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import LightingsList from './lightings-list';

export default function LightingsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<PageLoadingState />}>
      <LightingsList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
