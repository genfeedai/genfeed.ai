import IssuesList from '@app/(protected)/[orgSlug]/[brandSlug]/tasks/issues-list';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';

export const generateMetadata = createPageMetadata('Tasks');

export default function TasksPage() {
  return (
    <ErrorBoundary>
      <IssuesList />
    </ErrorBoundary>
  );
}
