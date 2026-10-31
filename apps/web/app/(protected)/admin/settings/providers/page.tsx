import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PlatformSettingsSection from '@protected/settings/platform-settings-section';

export const generateMetadata = createPageMetadata('Providers settings');

export default function PlatformProvidersSettingsPage() {
  return <PlatformSettingsSection tab="providers" />;
}
