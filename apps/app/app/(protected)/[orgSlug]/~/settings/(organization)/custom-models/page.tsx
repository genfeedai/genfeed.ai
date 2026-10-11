import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationCustomModelsCard from '../../(pages)/organization/custom-models/organization-custom-models-card';

export const generateMetadata = createPageMetadata('Custom Models');

export default function SettingsOrganizationFleetRoute() {
  return <OrganizationCustomModelsCard />;
}
