import IssueDetail from '@app/(protected)/[orgSlug]/[brandSlug]/tasks/[id]/issue-detail';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
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
      <Suspense fallback={null}>
        <IssueDetail issueId={id} useIdentifier={id.includes('-')} />
      </Suspense>
    </ErrorBoundary>
  );
}
