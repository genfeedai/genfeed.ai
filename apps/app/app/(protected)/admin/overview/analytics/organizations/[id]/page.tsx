import { APP_ROUTES } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';
import type { AnalyticsDetailPageProps } from '@props/admin/analytics.props';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Organization Analytics');

export default async function OrganizationDetailPage({
  params,
}: AnalyticsDetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<PageLoadingState />}>
      <AnalyticsOrganizationOverview
        organizationId={id}
        basePath={APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS}
      />
    </Suspense>
  );
}
