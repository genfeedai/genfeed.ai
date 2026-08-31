import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import InsightsOverview from './insights-overview';

export const generateMetadata = createPageMetadata('AI Insights');

export default function AnalyticsInsightsPage() {
  return (
    <Suspense fallback={null}>
      <InsightsOverview />
    </Suspense>
  );
}
