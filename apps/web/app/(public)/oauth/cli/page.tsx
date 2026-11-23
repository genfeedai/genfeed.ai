import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import CliAuthPage from './content';

export const generateMetadata = createPageMetadata('CLI OAuth');

export default function CliAuthRoute() {
  return (
    <Suspense fallback={null}>
      <CliAuthPage />
    </Suspense>
  );
}
