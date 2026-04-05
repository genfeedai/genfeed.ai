import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandSettingsAgentDefaultsPage from '@pages/settings/brands/brand-settings-agent-defaults-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Brand Agent Defaults');

export default function BrandSettingsAgentDefaultsRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <BrandSettingsAgentDefaultsPage />
    </Suspense>
  );
}
