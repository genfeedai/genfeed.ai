import { APP_ROUTES } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import AnalyticsOrganizationsList from './analytics-organizations-list';

export const generateMetadata = createPageMetadata('Organizations Analytics');

export default function OrganizationsAnalyticsPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <AnalyticsOrganizationsList
        basePath={APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS}
      />
    </Suspense>
  );
}
