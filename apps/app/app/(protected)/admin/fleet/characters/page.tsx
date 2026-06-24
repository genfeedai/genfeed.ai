import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CharactersList from '@protected/fleet/characters/characters-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Fleet Characters');

export default function FleetCharactersPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <CharactersList />
    </Suspense>
  );
}
