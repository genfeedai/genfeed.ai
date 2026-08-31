import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import SettingsProfilePage from './settings-profile-page';

export const generateMetadata = createPageMetadata('Personal Settings');

export default function SettingsPersonalPage() {
  return (
    <Suspense fallback={null}>
      <SettingsProfilePage />
    </Suspense>
  );
}
