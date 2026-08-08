import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

import PublishContentEditorPage from './PublishContentEditorPage';

export const generateMetadata = createPageMetadata('Edit content');

/**
 * Type-aware Publish content desk. Loads the editor for the content kind once
 * the record is resolved (social post today; article / newsletter next).
 */
export default async function PublishPostPage({ params }: DetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <PublishContentEditorPage contentId={id} />
    </Suspense>
  );
}
