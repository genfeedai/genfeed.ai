import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CharactersList from '@protected/fleet/characters/characters-list';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Fleet Characters');

export default function FleetCharactersPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <CharactersList />
    </Suspense>
  );
}
