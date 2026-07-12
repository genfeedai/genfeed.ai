import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import WorkspaceOverviewContent from './content';

export const generateMetadata = createPageMetadata('Workspace Dashboard');

export default function WorkspaceOverviewPage() {
  return (
    <ErrorBoundary>
      <WorkspaceOverviewContent />
    </ErrorBoundary>
  );
}
