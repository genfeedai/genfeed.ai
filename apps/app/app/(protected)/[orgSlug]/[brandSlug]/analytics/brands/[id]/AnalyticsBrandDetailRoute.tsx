'use client';

import AnalyticsBrandOverview from '@pages/analytics/brand-overview/analytics-brand-overview';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function AnalyticsBrandDetailRoute() {
  const params = useParams<{ id: string }>();
  const id = readRouteParam(params.id);

  return <AnalyticsBrandOverview brandId={id} />;
}
