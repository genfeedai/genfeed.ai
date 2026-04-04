import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import IssueDetail from '@pages/issues/detail/issue-detail';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Issue');

export default async function IssueDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <ErrorBoundary>
      <Suspense
        fallback={
          <div className="flex items-center justify-center py-20">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-white/20 border-t-white/60" />
          </div>
        }
      >
        <IssueDetail issueId={id} useIdentifier={id.includes('-')} />
      </Suspense>
    </ErrorBoundary>
  );
}
