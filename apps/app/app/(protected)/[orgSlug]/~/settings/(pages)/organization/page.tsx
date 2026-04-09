import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import SettingsOrganizationPage from './content';

export const generateMetadata = createPageMetadata('Organization Settings');

export default function SettingsOrgPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsOrganizationPage />
    </Suspense>
  );
}
