import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationModulesCard from '../../(pages)/organization/organization-modules-card';

export const generateMetadata = createPageMetadata('Modules');

export default function SettingsOrganizationModulesRoute() {
  return <OrganizationModulesCard />;
}
