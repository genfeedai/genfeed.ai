import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import SettingsOrganizationPolicyPage from './content';

export const generateMetadata = createPageMetadata('Organization Policy');

export default function SettingsOrganizationPolicyRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsOrganizationPolicyPage />
    </Suspense>
  );
}
