import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';
import { OrganizationWorkspaceOverviewSurfaceAdapter } from '@/features/workspace-overview/workspace-overview-surface-adapters';

export const generateMetadata = createPageMetadata('Organization Overview');

export default function OrgOverviewPage() {
  return (
    <OrganizationWorkspaceOverviewSurfaceAdapter>
      <AnalyticsOrganizationOverview />
    </OrganizationWorkspaceOverviewSurfaceAdapter>
  );
}
