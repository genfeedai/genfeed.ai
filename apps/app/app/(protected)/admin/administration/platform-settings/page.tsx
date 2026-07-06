import { SkeletonLoadingFallback } from '@components/loading/skeleton/SkeletonFallbacks';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PlatformSettingsPage from '@protected/administration/platform-settings/platform-settings-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Platform settings');

export default function PlatformSettingsRoutePage() {
  return (
    <Suspense fallback={<SkeletonLoadingFallback />}>
      <PlatformSettingsPage />
    </Suspense>
  );
}
