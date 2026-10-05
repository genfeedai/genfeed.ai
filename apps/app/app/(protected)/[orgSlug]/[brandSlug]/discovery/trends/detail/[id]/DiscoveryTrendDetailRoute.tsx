'use client';

import TrendDetail from '@pages/trends/detail/trend-detail';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function DiscoveryTrendDetailRoute() {
  const params = useParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return <TrendDetail trendId={id} backHref="/discovery/trends" />;
}
