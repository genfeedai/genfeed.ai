import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { notFound } from 'next/navigation';
import WorkspacePageContent from '../../../../[brandSlug]/workspace/workspace-page';

export const generateMetadata = createPageMetadata('Workspace Inbox');

const INBOX_VIEWS = new Set(['all', 'recent', 'unread']);

/**
 * Org-scoped inbox — all brands when no brand is selected; the active brand
 * filter still applies via WorkspacePageContent / TasksService when one is.
 */
export default async function OrgWorkspaceInboxViewPage({
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
