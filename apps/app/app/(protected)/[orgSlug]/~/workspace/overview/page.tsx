import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';
import { OrganizationWorkspaceOverviewSurfaceAdapter } from '@/features/workspace-overview/workspace-overview-surface-adapters';

export const generateMetadata = createPageMetadata('Organization Overview');

/**
 * Brand-less Workspace home — same surface as the legacy `~/overview` path,
 * but under the complete `/workspace/overview` prefix so the Workspace app
 * owns the URL with or without a brand selected.
 */
export default function OrgWorkspaceOverviewPage() {
  return (
    <OrganizationWorkspaceOverviewSurfaceAdapter>
      <AnalyticsOrganizationOverview />
    </OrganizationWorkspaceOverviewSurfaceAdapter>
  );
}
