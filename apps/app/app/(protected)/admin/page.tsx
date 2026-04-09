import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AdminDashboardPage from '@protected/overview/dashboard/page';

export const generateMetadata = createPageMetadata('Platform Admin');

export default async function PlatformAdminPage() {
  return <AdminDashboardPage />;
}
