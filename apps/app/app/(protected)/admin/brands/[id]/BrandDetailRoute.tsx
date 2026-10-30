'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import type { AnalyticsDetailPageProps } from '@/features/admin/props/analytics.props';
import AnalyticsBrandOverview from '@/features/analytics/brand-overview/analytics-brand-overview';
import { readRouteParam } from '@/lib/route-params';

export default function BrandDetailRoute() {
  const params = useRouteParams<Awaited<AnalyticsDetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return (
    <AnalyticsBrandOverview brandId={id} basePath={APP_ROUTES.ADMIN.ROOT} />
  );
}
