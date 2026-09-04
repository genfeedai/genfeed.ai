'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import ScenesList from './scenes-list';

export default function ScenesPage() {
  const { filters, onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <ScenesList
      filters={filters}
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
