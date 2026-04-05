import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsOrganizationPage from '@pages/settings/organization/settings-organization-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Organization Settings');

export default function SettingsOrgPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsOrganizationPage />
    </Suspense>
  );
}
