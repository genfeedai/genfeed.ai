import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import SettingsNotificationsPage from './settings-notifications-page';

export const generateMetadata = createPageMetadata('Notifications');

export default function SettingsNotifications() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsNotificationsPage />
    </Suspense>
  );
}
