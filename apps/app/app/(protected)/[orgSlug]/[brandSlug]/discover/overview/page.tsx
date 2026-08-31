import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrendsList from '@pages/trends/list/trends-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Discovery');

export default function DiscoverOverviewPage() {
  return (
    <Suspense fallback={null}>
      <TrendsList />
    </Suspense>
  );
}
