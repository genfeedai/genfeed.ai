import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LipSyncPage from '@protected/darkroom/lip-sync/lip-sync-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Darkroom Lip Sync');

export default function DarkroomLipSyncPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <LipSyncPage />
    </Suspense>
  );
}
