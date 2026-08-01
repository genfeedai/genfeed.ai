import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import WorkspacePageContent from '../../../[brandSlug]/workspace/workspace-page';

export const generateMetadata = createPageMetadata('Workspace Activity');

/** Org-scoped activity — org-wide when brand is cleared, brand-filtered when set. */
export default function OrgWorkspaceActivityPage() {
  return (
    <ErrorBoundary>
      <WorkspacePageContent section="activity" />
    </ErrorBoundary>
  );
}
