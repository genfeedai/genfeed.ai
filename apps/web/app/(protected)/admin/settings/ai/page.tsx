import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PlatformSettingsSection from '@protected/settings/platform-settings-section';

export const generateMetadata = createPageMetadata('AI settings');

export default function PlatformAISettingsPage() {
  return <PlatformSettingsSection tab="ai" />;
}
