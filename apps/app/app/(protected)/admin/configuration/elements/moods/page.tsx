'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import MoodsList from './moods-list';

export default function MoodsPage() {
  const { filters, onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <MoodsList
      filters={filters}
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
