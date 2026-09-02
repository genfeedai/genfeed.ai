'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import LightingsList from './lightings-list';

export default function LightingsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <LightingsList
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
