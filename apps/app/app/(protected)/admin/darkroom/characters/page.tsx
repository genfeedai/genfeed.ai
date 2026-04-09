import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CharactersList from '@protected/darkroom/characters/characters-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Darkroom Characters');

export default function DarkroomCharactersPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <CharactersList />
    </Suspense>
  );
}
