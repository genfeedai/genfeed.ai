import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import IssueDetail from './issue-detail';

export const generateMetadata = createPageMetadata('Issue');

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <ErrorBoundary>
      <Suspense fallback={<LazyLoadingFallback variant="minimal" />}>
        <IssueDetail issueId={id} useIdentifier={id.includes('-')} />
      </Suspense>
    </ErrorBoundary>
  );
}
