import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandSettingsVoicePage from './content';

export const generateMetadata = createPageMetadata('Brand voice');

export default function BrandSettingsVoiceRoute() {
  return (
    <Suspense fallback={null}>
      <BrandSettingsVoicePage />
    </Suspense>
  );
}
