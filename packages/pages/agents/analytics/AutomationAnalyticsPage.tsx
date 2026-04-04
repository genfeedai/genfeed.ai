'use client';

import AnalyticsList from '@pages/analytics/list/analytics-list';
import { PageScope } from '@ui-constants/misc.constant';

export default function AutomationAnalyticsPage() {
  return <AnalyticsList scope={PageScope.ANALYTICS} />;
}
