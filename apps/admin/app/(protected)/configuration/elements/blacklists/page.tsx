'use client';

import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import BlacklistsList from '@pages/elements/blacklists/blacklists-list';
import { useElementsContext } from '@providers/elements/elements.provider';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export default function BlacklistsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BlacklistsList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
