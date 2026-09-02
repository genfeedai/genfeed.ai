import { APP_ROUTES } from '@genfeedai/contracts/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import AnalyticsOrganizationsList from './analytics-organizations-list';

export const generateMetadata = createPageMetadata('Organizations Analytics');

export default function OrganizationsAnalyticsPage() {
  return (
    <Suspense fallback={null}>
      <AnalyticsOrganizationsList
        basePath={APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS}
      />
    </Suspense>
  );
}
