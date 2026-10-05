'use client';

import { APP_ROUTES } from '@genfeedai/contracts/constants';
import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';
import type { AnalyticsDetailPageProps } from '@props/admin/analytics.props';

import { useParams } from 'next/navigation';
import { readRouteParam } from '@/lib/route-params';

export default function OrganizationDetailRoute() {
  const params = useParams<Awaited<AnalyticsDetailPageProps['params']>>();
  const id = readRouteParam(params.id);

  return (
    <AnalyticsOrganizationOverview
      organizationId={id}
      basePath={APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS}
    />
  );
}
