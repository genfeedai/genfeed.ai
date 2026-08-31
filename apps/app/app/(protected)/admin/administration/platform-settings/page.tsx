import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PlatformSettingsPage from '@protected/administration/platform-settings/platform-settings-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Platform settings');

export default function PlatformSettingsRoutePage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <PlatformSettingsPage />
    </Suspense>
  );
}
