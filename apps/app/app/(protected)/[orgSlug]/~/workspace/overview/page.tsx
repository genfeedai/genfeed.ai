import { AnalyticsProvider } from '@contexts/analytics/analytics-context';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AnalyticsOrganizationOverview from '@pages/analytics/organization-overview/analytics-organization-overview';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import FeatureGate from '@ui/guards/feature/FeatureGate';
import Container from '@ui/layout/container/Container';
import { OrganizationWorkspaceOverviewSurfaceAdapter } from '@/features/workspace-overview/workspace-overview-surface-adapters';

export const generateMetadata = createPageMetadata('Workspace Overview');

export default function OrgWorkspaceOverviewPage() {
  return (
    <OrganizationWorkspaceOverviewSurfaceAdapter>
      <FeatureGate flagKey="analytics">
        <ErrorBoundary>
          <Container fullWidth label="Overview" titleVisibility="sr-only">
            <AnalyticsProvider>
              <AnalyticsOrganizationOverview />
            </AnalyticsProvider>
          </Container>
        </ErrorBoundary>
      </FeatureGate>
    </OrganizationWorkspaceOverviewSurfaceAdapter>
  );
}
