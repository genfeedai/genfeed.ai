import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import ScenesList from './scenes-list';

export const generateMetadata = createPageMetadata('Scenes Settings');

export default function SettingsScenesPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <ScenesList />
    </Suspense>
  );
}
