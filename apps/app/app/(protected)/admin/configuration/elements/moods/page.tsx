'use client';

import { PageScope } from '@genfeedai/enums';
import { useElementsContext } from '@providers/elements/elements.context';
import MoodsList from './moods-list';

export default function MoodsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <MoodsList
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
