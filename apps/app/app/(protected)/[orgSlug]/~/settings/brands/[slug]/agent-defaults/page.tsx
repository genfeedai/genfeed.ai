import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandSettingsAgentDefaultsPage from './content';

export const generateMetadata = createPageMetadata('Brand Agent Defaults');

export default function BrandSettingsAgentDefaultsRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsAgentDefaultsPage />
    </Suspense>
  );
}
