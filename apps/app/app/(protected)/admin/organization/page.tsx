import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { OrganizationConfigPageProps } from '@props/pages/page.props';
import OrganizationConfigPage from '@protected/organization/organization-config-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import AdminOrganizationsLanding from './admin-organizations-landing';

export const generateMetadata = createPageMetadata('Organizations');

export default async function OrganizationConfigPageWrapper({
  searchParams,
}: OrganizationConfigPageProps) {
  const { id } = await searchParams;
  if (!id) {
    return (
      <Suspense fallback={<PageLoadingState />}>
        <AdminOrganizationsLanding />
      </Suspense>
    );
  }

  return (
    <Suspense fallback={<PageLoadingState />}>
      <OrganizationConfigPage />
    </Suspense>
  );
}
