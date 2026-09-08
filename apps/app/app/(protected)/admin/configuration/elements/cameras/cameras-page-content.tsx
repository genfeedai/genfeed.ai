'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import CamerasList from './cameras-list';

export default function CamerasPageContent() {
  const { filters, onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <CamerasList
      filters={filters}
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
