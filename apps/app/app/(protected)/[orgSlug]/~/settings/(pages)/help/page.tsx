import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import SettingsHelpPage from './content';

export const generateMetadata = createPageMetadata('Help & Community');

export default function SettingsHelp() {
  return (
    <Suspense fallback={null}>
      <SettingsHelpPage />
    </Suspense>
  );
}
