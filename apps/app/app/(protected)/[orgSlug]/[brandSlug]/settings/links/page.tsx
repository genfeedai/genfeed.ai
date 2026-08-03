import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandSettingsLinksPage from './content';

export const generateMetadata = createPageMetadata('Links');

export default function BrandSettingsLinksRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsLinksPage />
    </Suspense>
  );
}
