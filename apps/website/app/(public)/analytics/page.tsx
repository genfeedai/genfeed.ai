import AnalyticsContent from '@public/analytics/analytics-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Content and Publishing Analytics',
  'Review available views and engagement across your published content. Compare post and brand performance to plan your next brief.',
  '/analytics',
);

export default function Analytics() {
  return <AnalyticsContent />;
}
