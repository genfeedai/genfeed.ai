import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LipSyncPage from '@protected/fleet/lip-sync/lip-sync-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Fleet Lip Sync');

export default function FleetLipSyncPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <LipSyncPage />
    </Suspense>
  );
}
