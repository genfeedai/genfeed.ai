import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import SettingsProfilePage from './settings-profile-page';

export const generateMetadata = createPageMetadata('Personal Settings');

export default function SettingsPersonalPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <SettingsProfilePage />
    </Suspense>
  );
}
