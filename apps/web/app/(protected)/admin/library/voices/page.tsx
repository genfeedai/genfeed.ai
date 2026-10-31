import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import VoicesLibraryPage from '@protected/library/voices/voices-library-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Voice Library');

export default function AdminLibraryVoicesPage() {
  return (
    <Suspense fallback={null}>
      <VoicesLibraryPage />
    </Suspense>
  );
}
