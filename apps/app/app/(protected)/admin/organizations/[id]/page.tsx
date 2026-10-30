import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationDetailPage from '@protected/organizations/[id]/organization-detail-page';

export const generateMetadata = createPageMetadata('Organization');

export default function AdminOrganizationDetailPage() {
  return <OrganizationDetailPage />;
}
