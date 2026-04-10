import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import IssuesList from './issues-list';

export const generateMetadata = createPageMetadata('Tasks');

export default function TasksPage() {
  return (
    <ErrorBoundary>
      <IssuesList />
    </ErrorBoundary>
  );
}
