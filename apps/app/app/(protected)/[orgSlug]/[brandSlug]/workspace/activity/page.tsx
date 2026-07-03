import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import WorkspacePageContent from '../workspace-page';

export const generateMetadata = createPageMetadata('Workspace Activity');

export default function WorkspaceActivityPage() {
  return (
    <ErrorBoundary>
      <WorkspacePageContent section="activity" />
    </ErrorBoundary>
  );
}
