import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationConfigPage from '@protected/organization/organization-config-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata(
  'Organization Configuration',
);

export default function OrganizationConfigPageWrapper() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <OrganizationConfigPage />
    </Suspense>
  );
}
