import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandSettingsAgentContextPage from './content';

export const generateMetadata = createPageMetadata('Agent context');

export default function BrandSettingsAgentContextRoute() {
  return (
    <Suspense fallback={null}>
      <BrandSettingsAgentContextPage />
    </Suspense>
  );
}
