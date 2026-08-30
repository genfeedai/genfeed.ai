import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ContentRunDetailPage from '@pages/content-runs/detail/content-run-detail';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Content Run');

export default async function ContentRunRoutePage({
  params,
}: {
  params: Promise<{ runId: string }>;
}) {
  const { runId } = await params;

  return (
    <ErrorBoundary>
      <Suspense fallback={<PageLoadingState />}>
        <ContentRunDetailPage runId={runId} />
      </Suspense>
    </ErrorBoundary>
  );
}
