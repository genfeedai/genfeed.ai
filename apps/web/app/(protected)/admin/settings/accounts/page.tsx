import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PlatformSettingsSection from '@protected/settings/platform-settings-section';

export const generateMetadata = createPageMetadata('Accounts settings');

export default function PlatformAccountsSettingsPage() {
  return <PlatformSettingsSection tab="accounts" />;
}
