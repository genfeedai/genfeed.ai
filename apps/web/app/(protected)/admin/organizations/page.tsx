import AdminOrganizationsLanding from '@app/(protected)/admin/organizations/admin-organizations-landing';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Organizations');

export default function AdminOrganizationsPage() {
  return (
    <Suspense fallback={null}>
      <AdminOrganizationsLanding />
    </Suspense>
  );
}
