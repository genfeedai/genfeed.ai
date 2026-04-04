import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';
import TemplateDetail from '@protected/content/templates/[id]/template-detail';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Template Detail');

export default async function TemplateDetailPage({ params }: DetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <TemplateDetail templateId={id} />
    </Suspense>
  );
}
