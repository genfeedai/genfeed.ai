import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PlatformSettingsSection from '@protected/settings/platform-settings-section';

export const generateMetadata = createPageMetadata('Agent settings');

export default function PlatformAgentSettingsPage() {
  return <PlatformSettingsSection tab="agent" />;
}
