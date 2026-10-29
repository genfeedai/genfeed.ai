'use client';

import TagsPage from '@app/(protected)/admin/configuration/tags/[filter]/tags-page';
import { PageScope } from '@genfeedai/contracts';
import { useSearchParams } from 'next/navigation';

export default function FilteredListRoute() {
  const searchParams = useSearchParams();
  const valueValues = searchParams.getAll('filter');
  const value = valueValues.length > 1 ? valueValues : valueValues[0];
  const selected =
    value === 'default' || value === 'organization' || value === 'account'
      ? value
      : 'all';
  return <TagsPage filter={selected} scope={PageScope.SUPERADMIN} />;
}
