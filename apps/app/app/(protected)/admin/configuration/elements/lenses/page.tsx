'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import LensesList from './lenses-list';

export default function LensesPage() {
  const { filters, onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <LensesList
      filters={filters}
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
