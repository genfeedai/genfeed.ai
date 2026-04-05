import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandSettingsVoicePage from '@pages/settings/brands/brand-settings-voice-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brand Voice');

export default function BrandSettingsVoiceRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsVoicePage />
    </Suspense>
  );
}
