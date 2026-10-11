import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationFleetCard from '../../(pages)/organization/fleet/organization-fleet-card';

export const generateMetadata = createPageMetadata('Fleet');

export default function SettingsOrganizationFleetRoute() {
  return <OrganizationFleetCard />;
}
