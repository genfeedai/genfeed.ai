import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PlatformSettingsSection from '@protected/settings/platform-settings-section';

export const generateMetadata = createPageMetadata('Billing settings');

export default function PlatformBillingSettingsPage() {
  return <PlatformSettingsSection tab="billing" />;
}
