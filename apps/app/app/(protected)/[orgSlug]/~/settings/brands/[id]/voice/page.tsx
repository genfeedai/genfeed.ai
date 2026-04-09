import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandSettingsVoicePage from './content';

export const generateMetadata = createPageMetadata('Brand Voice');

export default function BrandSettingsVoiceRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsVoicePage />
    </Suspense>
  );
}
