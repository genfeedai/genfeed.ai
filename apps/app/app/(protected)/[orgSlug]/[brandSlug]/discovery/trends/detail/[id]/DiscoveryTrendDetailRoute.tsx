'use client';

import { useRouteParams } from '@genfeedai/hooks/navigation/use-route-params';
import TrendDetail from '@/features/trends/detail/trend-detail';
import { readRouteParam } from '@/lib/route-params';

export default function DiscoveryTrendDetailRoute() {
  const params = useRouteParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return <TrendDetail trendId={id} backHref="/discovery/trends" />;
}
