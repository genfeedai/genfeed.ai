import ErrorBoundary from '@ui/display/error-boundary/ErrorBoundary';
import dynamic from 'next/dynamic';
import { Suspense } from 'react';
import type { EditorPageContentProps } from '@/features/studio/props/editor-page-content.props';

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
