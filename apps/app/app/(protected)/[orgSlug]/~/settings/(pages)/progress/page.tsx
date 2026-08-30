// biome-ignore assist/source/organizeImports: React and external packages precede package imports and path aliases.
import { Suspense } from 'react';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsProgressPage from '../personal/settings-progress-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';

export const generateMetadata = createPageMetadata('Progress');

export default function SettingsProgress() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <SettingsProgressPage />
    </Suspense>
  );
}
