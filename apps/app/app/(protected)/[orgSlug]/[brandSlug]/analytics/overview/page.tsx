import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOverview from '@pages/analytics/overview/analytics-overview';

export const generateMetadata = createPageMetadata('Analytics Overview');

export default function AnalyticsOverviewPage() {
  return <AnalyticsOverview scope={PageScope.ORGANIZATION} />;
}
