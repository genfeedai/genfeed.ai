import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import WorkspacePageContent from '../workspace-page';

export const generateMetadata = createPageMetadata('Workspace Inbox');

/**
 * The inbox is one page. Unread / Recent / All is the Status filter in the
 * subbar (`?status=`, Unread by default), not a route segment.
 */
export default function WorkspaceInboxPage() {
  return (
    <ErrorBoundary>
      <WorkspacePageContent section="inbox" />
    </ErrorBoundary>
  );
}
