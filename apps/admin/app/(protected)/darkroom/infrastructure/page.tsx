import InfrastructurePage from '@admin/(protected)/darkroom/infrastructure/infrastructure-page';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Darkroom Infrastructure');

export default function DarkroomInfrastructurePage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <InfrastructurePage />
    </Suspense>
  );
}
