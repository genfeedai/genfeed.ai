'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import AnalyticsBrandOverview from '@pages/analytics/brand-overview/analytics-brand-overview';
import type { AnalyticsDetailPageProps } from '@props/admin/analytics.props';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function BrandDetailRoute() {
  const params = useParams<Awaited<AnalyticsDetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return (
    <AnalyticsBrandOverview brandId={id} basePath={APP_ROUTES.ADMIN.ROOT} />
  );
}
