import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import OrganizationDetailPage from '@protected/organizations/[id]/organization-detail-page';

export const generateMetadata = createPageMetadata('Organization settings');

export default function AdminOrganizationSettingsPage() {
  return <OrganizationDetailPage activeTab="settings" />;
}
