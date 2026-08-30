import { PageScope } from '@genfeedai/enums';
import type { TagsFilterPageProps } from '@props/pages/page.props';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import TagsPage from './tags-page';

export default async function TagsFilterPage({ params }: TagsFilterPageProps) {
  const { filter } = await params;

  return (
    <Suspense fallback={<PageLoadingState />}>
      <TagsPage scope={PageScope.SUPERADMIN} filter={filter} />
    </Suspense>
  );
}
