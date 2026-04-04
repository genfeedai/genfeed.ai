import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StudioEditDetail from '@pages/studio/edit-detail/StudioEditDetail';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

interface StudioDetailPageProps {
  params: Promise<{ id: string; type: string }>;
}

export const generateMetadata = createPageMetadata('Studio Detail');

export default async function StudioDetailPage({
  params,
}: StudioDetailPageProps) {
  const { id } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <StudioEditDetail ingredientId={id} />
    </Suspense>
  );
}
