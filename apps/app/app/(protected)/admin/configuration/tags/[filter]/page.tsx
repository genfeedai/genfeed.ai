import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import type { TagsFilterPageProps } from '@props/pages/page.props';
import { Suspense } from 'react';
import TagsPage from './tags-page';

export default async function TagsFilterPage({ params }: TagsFilterPageProps) {
  const { filter } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <TagsPage scope={PageScope.SUPERADMIN} filter={filter} />
    </Suspense>
  );
}
