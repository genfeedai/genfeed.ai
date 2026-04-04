'use client';

import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import MoodsList from '@pages/elements/moods/moods-list';
import { useElementsContext } from '@providers/elements/elements.provider';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export default function MoodsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <MoodsList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
