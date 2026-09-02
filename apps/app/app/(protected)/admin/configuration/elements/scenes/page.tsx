'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import ScenesList from './scenes-list';

export default function ScenesPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <ScenesList
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
