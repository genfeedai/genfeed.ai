import OrganizationDetailRoute from '@app/(protected)/admin/overview/analytics/organizations/[id]/OrganizationDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Organization Analytics');

export default function OrganizationDetailPage() {
  return (
    <Suspense fallback={null}>
      <OrganizationDetailRoute />
    </Suspense>
  );
}
