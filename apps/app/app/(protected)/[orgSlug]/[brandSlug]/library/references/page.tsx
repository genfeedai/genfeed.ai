import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import LibraryCharactersPage from './content';

export const generateMetadata = createPageMetadata('References');

export default function LibraryReferencesRoute() {
  return (
    <Suspense fallback={null}>
      <LibraryCharactersPage />
    </Suspense>
  );
}
