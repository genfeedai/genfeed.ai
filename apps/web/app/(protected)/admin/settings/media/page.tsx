import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PlatformSettingsSection from '@protected/settings/platform-settings-section';

export const generateMetadata = createPageMetadata('Media settings');

export default function PlatformMediaSettingsPage() {
  return <PlatformSettingsSection tab="media" />;
}
