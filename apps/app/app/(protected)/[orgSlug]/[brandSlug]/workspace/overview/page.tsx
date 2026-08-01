import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import Container from '@ui/layout/container/Container';
import { BrandWorkspaceOverviewSurfaceAdapter } from '@/features/workspace-overview/workspace-overview-surface-adapters';
import WorkspaceOverviewContent from './content';

export const generateMetadata = createPageMetadata('Workspace Overview');

export default function WorkspaceOverviewPage() {
  return (
    <BrandWorkspaceOverviewSurfaceAdapter>
      <ErrorBoundary>
        {/* Container owns equal page insets — OperationalHomeContent and the
            custom OpenUI dashboard both rely on this wrapper and must not
            invent their own px/py. Do not pass lucide icons from this server
            page into the client Container (functions cannot cross the RSC
            boundary). */}
        <Container fullWidth label="Overview" titleVisibility="sr-only">
          <WorkspaceOverviewContent />
        </Container>
      </ErrorBoundary>
    </BrandWorkspaceOverviewSurfaceAdapter>
  );
}
