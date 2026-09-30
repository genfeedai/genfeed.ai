import AnalyticsContent from '@public/analytics/analytics-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Content Analytics and Revenue Data',
  'Track revenue, not vanity metrics. Post, trend, and per-brand performance analytics with a hook lab that turns creative data into what to make next.',
  '/analytics',
);

export default function Analytics() {
  return <AnalyticsContent />;
}
