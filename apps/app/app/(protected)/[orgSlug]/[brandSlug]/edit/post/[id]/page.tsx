import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import PostEditorContent from './content';

export const generateMetadata = createPageMetadata('Edit Post');

export default async function PostEditorPage({ params }: DetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <PostEditorContent artifactId={id} />
    </Suspense>
  );
}
