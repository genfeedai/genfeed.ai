'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import SoundsList from './sounds-list';

export default function SoundsPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <SoundsList
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
