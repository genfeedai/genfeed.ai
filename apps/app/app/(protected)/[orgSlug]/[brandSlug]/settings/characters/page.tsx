import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import BrandSettingsCharactersPage from './content';

export const generateMetadata = createPageMetadata('Characters');

export default function BrandSettingsCharactersRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <BrandSettingsCharactersPage />
    </Suspense>
  );
}
