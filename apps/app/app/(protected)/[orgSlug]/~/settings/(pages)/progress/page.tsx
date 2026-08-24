// biome-ignore assist/source/organizeImports: React and external packages precede package imports and path aliases.
import { Suspense } from 'react';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import SettingsProgressPage from '../personal/settings-progress-page';

export const generateMetadata = createPageMetadata('Progress');

export default function SettingsProgress() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsProgressPage />
    </Suspense>
  );
}
