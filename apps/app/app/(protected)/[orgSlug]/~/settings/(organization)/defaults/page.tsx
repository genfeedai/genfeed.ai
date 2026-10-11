import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsOrganizationDefaultsPage from '../../(pages)/organization/organization-defaults-content';

export const generateMetadata = createPageMetadata('Defaults');

export default function SettingsOrgDefaultsRoute() {
  return <SettingsOrganizationDefaultsPage />;
}
