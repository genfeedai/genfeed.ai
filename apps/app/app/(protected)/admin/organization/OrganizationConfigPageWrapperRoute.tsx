'use client';

import AdminOrganizationsLanding from '@app/(protected)/admin/organization/admin-organizations-landing';
import OrganizationConfigPage from '@protected/organization/organization-config-page';
import { useSearchParams } from 'next/navigation';

export default function OrganizationConfigPageWrapperRoute() {
  const searchParams = useSearchParams();
  const idValues = searchParams.getAll('id');
  const id = idValues.length > 1 ? idValues : idValues[0];
  if (!id) {
    return <AdminOrganizationsLanding />;
  }

  return <OrganizationConfigPage />;
}
