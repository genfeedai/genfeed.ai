import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsProfilePage from './settings-profile-page';

export const generateMetadata = createPageMetadata('Personal Settings');

export default function SettingsPersonalPage() {
  return <SettingsProfilePage />;
}
