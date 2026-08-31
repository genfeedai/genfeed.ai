// biome-ignore assist/source/organizeImports: React and external packages precede package imports and path aliases.
import { Suspense } from 'react';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsNotificationsPage from './settings-notifications-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';

export const generateMetadata = createPageMetadata('Notifications');

export default function SettingsNotifications() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <SettingsNotificationsPage />
    </Suspense>
  );
}
