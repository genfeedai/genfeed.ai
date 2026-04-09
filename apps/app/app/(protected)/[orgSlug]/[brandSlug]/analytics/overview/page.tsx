import { loadAnalyticsOverviewPageData } from '@app-server/analytics-overview-page-data.server';
import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOverview from '@pages/analytics/overview/analytics-overview';

export const generateMetadata = createPageMetadata('Analytics Overview');

export default async function AnalyticsOverviewPage() {
  const initialData = await loadAnalyticsOverviewPageData(
    PageScope.ORGANIZATION,
  );

  return <AnalyticsOverview {...initialData} />;
}
