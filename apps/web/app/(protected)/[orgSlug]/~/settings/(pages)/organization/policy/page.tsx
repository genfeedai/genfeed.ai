import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsOrganizationPolicyPage from '@pages/settings/organization/settings-organization-policy-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Organization Policy');

export default function SettingsOrganizationPolicyRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsOrganizationPolicyPage />
    </Suspense>
  );
}
