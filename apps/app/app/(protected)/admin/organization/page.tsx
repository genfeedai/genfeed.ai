import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { OrganizationConfigPageProps } from '@props/pages/page.props';
import OrganizationConfigPage from '@protected/organization/organization-config-page';
import { Suspense } from 'react';
import AdminOrganizationsLanding from './admin-organizations-landing';

export const generateMetadata = createPageMetadata('Organizations');

export default async function OrganizationConfigPageWrapper({
  searchParams,
}: OrganizationConfigPageProps) {
  const { id } = await searchParams;
  if (!id) {
    return (
      <Suspense fallback={null}>
        <AdminOrganizationsLanding />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={null}>
      <OrganizationConfigPage />
    </Suspense>
  );
}
