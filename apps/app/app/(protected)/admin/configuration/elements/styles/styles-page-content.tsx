'use client';

import { PageScope } from '@genfeedai/contracts';
import { useElementsContext } from '@providers/elements/elements.context';
import StylesList from './styles-list';

export default function StylesPageContent() {
  const { filters, onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <StylesList
      filters={filters}
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
