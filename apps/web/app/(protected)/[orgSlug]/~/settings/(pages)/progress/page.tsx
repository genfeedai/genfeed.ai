import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsProgressPage from '../personal/settings-progress-page';

export const generateMetadata = createPageMetadata('Progress');

export default function SettingsProgress() {
  return <SettingsProgressPage />;
}
