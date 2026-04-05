import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsHelpPage from '@pages/settings/help/settings-help-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Help & Community');

export default function SettingsHelp() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsHelpPage />
    </Suspense>
  );
}
