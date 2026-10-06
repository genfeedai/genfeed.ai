import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandAgentSettingsPage from './content';

export const generateMetadata = createPageMetadata('Agent settings');

export default function BrandAgentSettingsRoute() {
  return (
    <Suspense fallback={null}>
      <BrandAgentSettingsPage />
    </Suspense>
  );
}
