'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import AnalyticsBrandOverview from '@/features/analytics/brand-overview/analytics-brand-overview';
import { readRouteParam } from '@/lib/route-params';

export default function OrgAnalyticsBrandDetailRoute() {
  const params = useRouteParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return <AnalyticsBrandOverview brandId={id} />;
}
