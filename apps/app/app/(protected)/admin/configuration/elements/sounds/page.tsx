'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import SoundsList from './sounds-list';

export default function SoundsPage() {
  const { filters, onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <SoundsList
      filters={filters}
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
