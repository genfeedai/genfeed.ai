'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import AnalyticsPlatformDetail from '@/features/analytics/platform-detail/analytics-platform-detail';
import { readRouteParam } from '@/lib/route-params';

export default function AnalyticsBrandPlatformDetailRoute() {
  const params = useRouteParams<{ id: string; platform: string }>();
  const id = readRouteParam(params.id);
  const platform = readRouteParam(params.platform);

  return <AnalyticsPlatformDetail brandId={id} platform={platform} />;
}
