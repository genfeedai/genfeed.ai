import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import ScenesList from './scenes-list';

export const generateMetadata = createPageMetadata('Scenes Settings');

export default function SettingsScenesPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ScenesList />
    </Suspense>
  );
}
