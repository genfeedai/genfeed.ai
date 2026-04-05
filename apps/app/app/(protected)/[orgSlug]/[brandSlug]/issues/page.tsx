import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IssuesList from '@pages/issues/list/issues-list';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';

export const generateMetadata = createPageMetadata('Issues');

export default function IssuesPage() {
  return (
    <ErrorBoundary>
      <IssuesList />
    </ErrorBoundary>
  );
}
