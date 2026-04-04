import { loadOverviewPageData } from '@app-server/overview-page-data.server';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import WorkspacePageContent from '../workspace-page';

export const generateMetadata = createPageMetadata('Workspace Dashboard');

export default async function WorkspaceOverviewPage() {
  const initialData = await loadOverviewPageData();

  return (
    <ErrorBoundary>
      <WorkspacePageContent
        initialActiveRuns={initialData.activeRuns}
        initialAnalytics={initialData.analytics}
        initialReviewInbox={initialData.reviewInbox}
        initialRuns={initialData.runs}
        initialStats={initialData.stats}
        initialTimeSeriesData={initialData.timeSeriesData}
      />
    </ErrorBoundary>
  );
}
