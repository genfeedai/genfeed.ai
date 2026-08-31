import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import { Suspense } from 'react';
import ArticleEditorContent from './content';

export const generateMetadata = createPageMetadata('Edit Article');

export default async function ArticleEditorPage({ params }: DetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={null}>
      <ArticleEditorContent artifactId={id} />
    </Suspense>
  );
}
