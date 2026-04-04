import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';
import type { AnalyticsDetailPageProps } from '@props/admin/analytics.props';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Organization Analytics');

export default async function OrganizationDetailPage({
  params,
}: AnalyticsDetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <AnalyticsOrganizationOverview
        organizationId={id}
        basePath="/analytics"
      />
    </Suspense>
  );
}
