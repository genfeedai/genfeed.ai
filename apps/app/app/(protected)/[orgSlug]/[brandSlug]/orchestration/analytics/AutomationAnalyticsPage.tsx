'use client';

import { PageScope } from '@genfeedai/enums';
import AnalyticsList from '@pages/analytics/list/analytics-list';

export default function AutomationAnalyticsPage() {
  return <AnalyticsList scope={PageScope.ANALYTICS} />;
}
