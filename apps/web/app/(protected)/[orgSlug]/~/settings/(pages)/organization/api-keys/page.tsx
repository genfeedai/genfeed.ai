import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsApiKeysPage from '@pages/settings/api-keys/settings-api-keys-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('API Keys');

export default function SettingsOrganizationApiKeysRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsApiKeysPage />
    </Suspense>
  );
}
