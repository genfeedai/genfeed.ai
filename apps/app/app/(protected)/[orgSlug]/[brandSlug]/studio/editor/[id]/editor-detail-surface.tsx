import type { EditorPageContentProps } from '@props/studio/editor-page-content.props';
import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';

const EditorPageContent = dynamic(() => import('./editor-page-content'));

export default function EditorDetailSurface({
  projectId,
}: EditorPageContentProps) {
  return (
    <ErrorBoundary>
      <Suspense fallback={null}>
        <EditorPageContent projectId={projectId} />
      </Suspense>
    </ErrorBoundary>
  );
}
