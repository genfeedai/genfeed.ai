'use client';

import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import StylesList from '@pages/elements/styles/styles-list';
import { useElementsContext } from '@providers/elements/elements.provider';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export default function StylesPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <StylesList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
