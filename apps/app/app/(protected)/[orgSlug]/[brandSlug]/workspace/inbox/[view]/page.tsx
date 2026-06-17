import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { notFound } from 'next/navigation';
import WorkspacePageContent from '../../workspace-page';

export const generateMetadata = createPageMetadata('Workspace Inbox');

const INBOX_VIEWS = new Set(['all', 'recent', 'unread']);

export default async function WorkspaceInboxViewPage({
  params,
}: {
  params: Promise<{ view: string }>;
}) {
  const { view } = await params;

  if (!INBOX_VIEWS.has(view)) {
    notFound();
  }

  return (
    <ErrorBoundary>
      <WorkspacePageContent
        defaultInboxView={view as 'all' | 'recent' | 'unread'}
        section="inbox"
      />
    </ErrorBoundary>
  );
}
