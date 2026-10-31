import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BusinessDashboard from './business-dashboard';

export const generateMetadata = createPageMetadata('Business Analytics');

export default function BusinessAnalyticsPage() {
  return <BusinessDashboard />;
}
