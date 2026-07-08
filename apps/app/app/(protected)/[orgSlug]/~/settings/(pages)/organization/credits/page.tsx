import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import SettingsCreditsPage from './content';

export const generateMetadata = createPageMetadata('Credits Settings');

export default function SettingsOrganizationCreditsRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsCreditsPage />
    </Suspense>
  );
}
