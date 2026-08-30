'use client';

import { PageScope } from '@genfeedai/enums';
import { useElementsContext } from '@providers/elements/elements.context';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import BlacklistsList from './blacklists-list';

export default function BlacklistsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<PageLoadingState />}>
      <BlacklistsList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
