import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import NewsletterEditorContent from './content';

export const generateMetadata = createPageMetadata('Edit Newsletter');

export default async function NewsletterEditorPage({
  params,
}: DetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <NewsletterEditorContent artifactId={id} />
    </Suspense>
  );
}
