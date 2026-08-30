'use client';

import { PageScope } from '@genfeedai/enums';
import { useElementsContext } from '@providers/elements/elements.context';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import MoodsList from './moods-list';

export default function MoodsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <Suspense fallback={<PageLoadingState />}>
      <MoodsList
        scope={PageScope.SUPERADMIN}
        onRefresh={onRefresh}
        onRefreshingChange={setIsRefreshing}
      />
    </Suspense>
  );
}
