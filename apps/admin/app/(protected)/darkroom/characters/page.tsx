import CharactersList from '@admin/(protected)/darkroom/characters/characters-list';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Darkroom Characters');

export default function DarkroomCharactersPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <CharactersList />
    </Suspense>
  );
}
