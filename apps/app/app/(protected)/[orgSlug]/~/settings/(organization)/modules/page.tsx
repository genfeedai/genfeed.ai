import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationModulesCard from '../../(pages)/organization/organization-modules-card';
import OrganizationRailDefaultsCard from '../../(pages)/organization/organization-rail-defaults-card';

export const generateMetadata = createPageMetadata('Modules');

export default function SettingsOrganizationModulesRoute() {
  return (
    <div className="flex flex-col gap-8">
      <OrganizationModulesCard />
      <OrganizationRailDefaultsCard />
    </div>
  );
}
