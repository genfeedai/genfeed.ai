import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PlatformSettingsSection from '@protected/settings/platform-settings-section';

export const generateMetadata = createPageMetadata('Notifications settings');

export default function PlatformNotificationsSettingsPage() {
  return <PlatformSettingsSection tab="notifications" />;
}
