import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import ConnectSocialFlow from './connect-social-flow';

export const generateMetadata = createPageMetadata('Connect social account');

export default function ConnectSocialPage() {
  return (
    <Suspense>
      <ConnectSocialFlow />
    </Suspense>
  );
}
