import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { FilterPageProps } from '@props/pages/page.props';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import WorkspacePageContent from '../workspace-page';

export const generateMetadata = createPageMetadata('Workspace Inbox');

export default async function WorkspaceInboxPage({
  searchParams,
}: FilterPageProps) {
  const { view } = await searchParams;
  const inboxView = view === 'all' || view === 'recent' ? view : 'unread';
  return (
    <ErrorBoundary>
      <WorkspacePageContent defaultInboxView={inboxView} section="inbox" />
    </ErrorBoundary>
  );
}
