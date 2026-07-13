import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { BrandWorkspaceOverviewSurfaceAdapter } from '@/features/workspace-overview/workspace-overview-surface-adapters';
import WorkspaceOverviewContent from './content';

export const generateMetadata = createPageMetadata('Workspace Dashboard');

export default function WorkspaceOverviewPage() {
  return (
    <BrandWorkspaceOverviewSurfaceAdapter>
      <ErrorBoundary>
        <WorkspaceOverviewContent />
      </ErrorBoundary>
    </BrandWorkspaceOverviewSurfaceAdapter>
  );
}
