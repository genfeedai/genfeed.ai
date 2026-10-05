'use client';

import AnalyticsPlatformDetail from '@pages/analytics/platform-detail/analytics-platform-detail';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function AdminAnalyticsBrandPlatformDetailRoute() {
  const params = useParams<{ id: string; platform: string }>();
  const id = readRouteParam(params.id);
  const platform = readRouteParam(params.platform);

  return (
    <AnalyticsPlatformDetail
      brandId={id}
      platform={platform}
      basePath="/admin/overview/analytics"
    />
  );
}
