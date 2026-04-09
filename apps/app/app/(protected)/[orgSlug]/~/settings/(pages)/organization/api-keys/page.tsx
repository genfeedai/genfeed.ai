import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import SettingsApiKeysPage from './content';

export const generateMetadata = createPageMetadata('API Keys');

export default function SettingsOrganizationApiKeysRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsApiKeysPage />
    </Suspense>
  );
}
