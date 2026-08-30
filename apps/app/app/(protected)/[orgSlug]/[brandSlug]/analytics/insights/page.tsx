import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import InsightsOverview from './insights-overview';

export const generateMetadata = createPageMetadata('AI Insights');

export default function AnalyticsInsightsPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <InsightsOverview />
    </Suspense>
  );
}
