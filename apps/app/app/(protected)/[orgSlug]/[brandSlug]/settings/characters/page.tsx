import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandSettingsCharactersPage from './content';

export const generateMetadata = createPageMetadata('Characters');

export default function BrandSettingsCharactersRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsCharactersPage />
    </Suspense>
  );
}
