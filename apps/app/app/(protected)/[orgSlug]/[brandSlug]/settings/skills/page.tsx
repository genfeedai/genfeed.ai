import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import BrandSettingsSkillsPage from './content';

export const generateMetadata = createPageMetadata('Brand Skills');

export default function BrandSettingsSkillsRoute() {
  return (
    <ErrorBoundary>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <BrandSettingsSkillsPage />
      </Suspense>
    </ErrorBoundary>
  );
}
