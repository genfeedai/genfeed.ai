import { PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { FilterPageProps } from '@props/pages/page.props';
import { Suspense } from 'react';
import TagsPage from './[filter]/tags-page';

export const generateMetadata = createPageMetadata('Tags');

export default async function FilteredListPage({
  searchParams,
}: FilterPageProps) {
  const { filter: value } = await searchParams;
  const selected =
    value === 'default' || value === 'organization' || value === 'account'
      ? value
      : 'all';
  return (
    <Suspense fallback={null}>
      <TagsPage filter={selected} scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
