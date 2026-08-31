import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsPostsList from '@pages/analytics/posts-list/analytics-posts-list';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Posts Analytics');

export default function AnalyticsPostsPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <AnalyticsPostsList />
    </Suspense>
  );
}
