import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationConfigPage from '@protected/organizations/[id]/organization-config-page';

export const generateMetadata = createPageMetadata(
  'Organization Configuration',
);

export default function AdminOrganizationConfigPage() {
  return <OrganizationConfigPage />;
}
