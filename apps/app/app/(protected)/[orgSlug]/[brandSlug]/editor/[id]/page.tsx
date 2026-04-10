import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Editor');
const EditorPageContent = dynamic(() => import('./editor-page-content'));

export default async function EditorDetailPage({ params }: DetailPageProps) {
  const { id } = await params;

  return (
    <ErrorBoundary>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <EditorPageContent projectId={id} />
      </Suspense>
    </ErrorBoundary>
  );
}
