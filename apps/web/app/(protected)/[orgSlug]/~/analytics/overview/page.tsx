import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';

export const generateMetadata = createPageMetadata(
  'Organization Analytics Overview',
);

export default function OrgAnalyticsOverviewPage() {
  return <AnalyticsOrganizationOverview />;
}
