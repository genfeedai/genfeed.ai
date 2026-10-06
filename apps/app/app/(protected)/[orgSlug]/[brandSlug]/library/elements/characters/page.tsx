import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import LibraryCharactersPage from './content';

export const generateMetadata = createPageMetadata('Characters');

export default function LibraryCharactersRoute() {
  return (
    <Suspense fallback={null}>
      <LibraryCharactersPage />
    </Suspense>
  );
}
