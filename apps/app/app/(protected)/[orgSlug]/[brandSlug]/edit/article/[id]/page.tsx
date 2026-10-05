import ArticleEditorRoute from '@app/(protected)/[orgSlug]/[brandSlug]/edit/article/[id]/ArticleEditorRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Edit Article');

export default function ArticleEditorPage() {
  return (
    <Suspense fallback={null}>
      <ArticleEditorRoute />
    </Suspense>
  );
}
