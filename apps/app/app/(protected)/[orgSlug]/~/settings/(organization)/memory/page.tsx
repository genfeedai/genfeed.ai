import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsOrganizationMemoryPage from '../../(pages)/organization/memory/content';

export const generateMetadata = createPageMetadata('Organization Memory');

export default function SettingsOrganizationMemoryRoute() {
  return <SettingsOrganizationMemoryPage />;
}
