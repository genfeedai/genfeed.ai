import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import BrandSettingsAgentDefaultsPage from './content';

export const generateMetadata = createPageMetadata('Brand Agent Defaults');

export default function BrandSettingsAgentDefaultsRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <BrandSettingsAgentDefaultsPage />
    </Suspense>
  );
}
