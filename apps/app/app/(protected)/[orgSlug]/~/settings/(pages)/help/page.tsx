import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import SettingsHelpPage from './content';

export const generateMetadata = createPageMetadata('Help & Community');

export default function SettingsHelp() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsHelpPage />
    </Suspense>
  );
}
