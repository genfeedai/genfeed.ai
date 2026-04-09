'use client';

import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import { useElementsContext } from '@providers/elements/elements.provider';
import { Suspense } from 'react';
import SoundsList from './sounds-list';

export default function SoundsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SoundsList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
