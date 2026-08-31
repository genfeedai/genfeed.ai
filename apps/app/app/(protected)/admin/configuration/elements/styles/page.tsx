'use client';

import { PageScope } from '@genfeedai/enums';
import { useElementsContext } from '@providers/elements/elements.context';
import StylesList from './styles-list';

export default function StylesPage() {
  const { onRefresh, setIsRefreshing } = useElementsContext();

  return (
    <StylesList
      scope={PageScope.SUPERADMIN}
      onRefresh={onRefresh}
      onRefreshingChange={setIsRefreshing}
    />
  );
}
