import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrendsList from '@pages/trends/list/trends-list';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Discover');

export default function DiscoverOverviewPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <TrendsList />
    </Suspense>
  );
}
