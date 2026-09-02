'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import CamerasList from './cameras-list';

export default function CamerasPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <CamerasList
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
