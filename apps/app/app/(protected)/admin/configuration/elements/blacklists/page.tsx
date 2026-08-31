'use client';

import { PageScope } from '@genfeedai/enums';
import { useElementsContext } from '@providers/elements/elements.context';
import BlacklistsList from './blacklists-list';

export default function BlacklistsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <BlacklistsList
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
