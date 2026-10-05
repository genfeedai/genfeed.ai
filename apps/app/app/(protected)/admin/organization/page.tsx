import OrganizationConfigPageWrapperRoute from '@app/(protected)/admin/organization/OrganizationConfigPageWrapperRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Organizations');

export default function OrganizationConfigPageWrapper() {
  return (
    <Suspense fallback={null}>
      <OrganizationConfigPageWrapperRoute />
    </Suspense>
  );
}
