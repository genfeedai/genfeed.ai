import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsOrganizationPage from '../../(pages)/organization/content';

export const generateMetadata = createPageMetadata('Organization Settings');

export default function SettingsOrgGeneralPage() {
  return <SettingsOrganizationPage />;
}
