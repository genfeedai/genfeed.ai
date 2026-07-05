import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsContent from '@public/analytics/analytics-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Analytics',
  'Track revenue, not vanity metrics. Post, trend, and per-brand performance analytics with a hook lab that turns creative data into what to make next.',
  '/analytics',
);

export default function Analytics() {
  return <AnalyticsContent />;
}
