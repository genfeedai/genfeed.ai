import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';

export const generateMetadata = createPageMetadata('Organization Overview');

export default function OrgOverviewPage() {
  return <AnalyticsOrganizationOverview />;
}
