'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import CameraMovementsList from './camera-movements-list';

export default function CameraMovementsPageContent() {
  const { filters, onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <CameraMovementsList
      filters={filters}
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
