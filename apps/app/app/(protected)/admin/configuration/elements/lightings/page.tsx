'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import LightingsList from './lightings-list';

export default function LightingsPage() {
  const { filters, onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <LightingsList
      filters={filters}
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
