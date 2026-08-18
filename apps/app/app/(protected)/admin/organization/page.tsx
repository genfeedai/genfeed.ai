import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { APP_ROUTES } from '@genfeedai/constants';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { OrganizationConfigPageProps } from '@props/pages/page.props';
import OrganizationConfigPage from '@protected/organization/organization-config-page';
import { redirect } from 'next/navigation';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata(
  'Organization Configuration',
);

export default async function OrganizationConfigPageWrapper({
  searchParams,
}: OrganizationConfigPageProps) {
  const { id } = await searchParams;
  if (!id) {
    redirect(APP_ROUTES.ADMIN.OVERVIEW.ANALYTICS_ORGANIZATIONS);
  }

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <OrganizationConfigPage />
    </Suspense>
  );
}
