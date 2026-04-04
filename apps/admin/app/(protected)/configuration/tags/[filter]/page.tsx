import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import TagsPage from '@pages/tags/page/tags-page';
import type { TagsFilterPageProps } from '@props/pages/page.props';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export default async function TagsFilterPage({ params }: TagsFilterPageProps) {
  const { filter } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <TagsPage scope={PageScope.SUPERADMIN} filter={filter} />
    </Suspense>
  );
}
