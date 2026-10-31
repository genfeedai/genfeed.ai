import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import DiscoveryTrendTurnover from './discovery-trend-turnover';

export const generateMetadata = createPageMetadata('Trend Turnover');

export default function TrendTurnoverPage() {
  return (
    <Suspense fallback={null}>
      <DiscoveryTrendTurnover />
    </Suspense>
  );
}
