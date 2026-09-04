'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import BlacklistsList from './blacklists-list';

export default function BlacklistsPage() {
  const { filters, onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <BlacklistsList
      filters={filters}
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
