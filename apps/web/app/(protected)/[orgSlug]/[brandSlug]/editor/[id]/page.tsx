import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import type { DetailPageProps } from '@/props/pages/page.props';
import EditorDetailContent from './editor-detail-content';

export const generateMetadata = createPageMetadata('Editor');

// The id is read inside the boundary: awaiting it at the top of the page makes
// the whole route a request-time hole, so a prepared destination would still
// wait for the server render on click.
export default function EditorDetailPage({ params }: DetailPageProps) {
  return (
    <Suspense fallback={null}>
      <EditorDetailContent params={params} />
    </Suspense>
  );
}
