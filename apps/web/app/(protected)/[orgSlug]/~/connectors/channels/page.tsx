import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import ConnectorsChannelsPage from './content';

export const generateMetadata = createPageMetadata('Channels');

export default function ConnectorsChannelsRoute() {
  return (
    <Suspense fallback={null}>
      <ConnectorsChannelsPage />
    </Suspense>
  );
}
