import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsNotificationsPage from './settings-notifications-page';

export const generateMetadata = createPageMetadata('Notifications');

export default function SettingsNotifications() {
  return <SettingsNotificationsPage />;
}
