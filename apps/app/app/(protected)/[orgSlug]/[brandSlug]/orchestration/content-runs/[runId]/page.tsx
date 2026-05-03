import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ContentRunDetailPage from '@pages/content-runs/detail/content-run-detail';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
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
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <ContentRunDetailPage runId={runId} />
      </Suspense>
    </ErrorBoundary>
  );
}
