import { loadOverviewPageData } from '@app-server/overview-page-data.server';
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

  const initialData = await loadOverviewPageData();

  return (
    <ErrorBoundary>
      <WorkspacePageContent
        defaultInboxView={view as 'all' | 'recent' | 'unread'}
        initialActiveRuns={initialData.activeRuns}
        initialAnalytics={initialData.analytics}
        initialReviewInbox={initialData.reviewInbox}
        initialRuns={initialData.runs}
        initialStats={initialData.stats}
        initialTimeSeriesData={initialData.timeSeriesData}
        section="inbox"
      />
    </ErrorBoundary>
  );
}
