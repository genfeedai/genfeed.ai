import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import { Suspense } from 'react';

import PublishContentEditorPage from './PublishContentEditorPage';

export const generateMetadata = createPageMetadata('Edit content');

/**
 * Type-aware Publish content desk. The canonical route composes the existing
 * social post, article, and newsletter editor surfaces.
 */
export default async function PublishPostPage({ params }: DetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <PublishContentEditorPage contentId={id} />
    </Suspense>
  );
}
