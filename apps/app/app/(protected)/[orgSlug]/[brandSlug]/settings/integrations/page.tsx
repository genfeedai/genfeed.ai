import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandSettingsIntegrationsPage from './content';

export const generateMetadata = createPageMetadata('Integrations');

export default function BrandSettingsIntegrationsRoute() {
  return (
    <Suspense fallback={null}>
      <BrandSettingsIntegrationsPage />
    </Suspense>
  );
}
