import LipSyncPage from '@admin/(protected)/darkroom/lip-sync/lip-sync-page';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Darkroom Lip Sync');

export default function DarkroomLipSyncPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <LipSyncPage />
    </Suspense>
  );
}
