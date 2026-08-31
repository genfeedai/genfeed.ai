import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandSettingsCharactersPage from './content';

export const generateMetadata = createPageMetadata('Characters');

export default function BrandSettingsCharactersRoute() {
  return (
    <Suspense fallback={null}>
      <BrandSettingsCharactersPage />
    </Suspense>
  );
}
