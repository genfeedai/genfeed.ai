// biome-ignore assist/source/organizeImports: React and external packages precede package imports and path aliases.
import { Suspense } from 'react';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsNotificationsPage from './settings-notifications-page';

export const generateMetadata = createPageMetadata('Notifications');

export default function SettingsNotifications() {
  return (
    <Suspense fallback={null}>
      <SettingsNotificationsPage />
    </Suspense>
  );
}
