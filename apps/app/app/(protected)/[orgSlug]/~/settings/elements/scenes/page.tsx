import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ScenesList from '@pages/scenes/list/scenes-list';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Scenes Settings');

export default function SettingsScenesPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ScenesList />
    </Suspense>
  );
}
