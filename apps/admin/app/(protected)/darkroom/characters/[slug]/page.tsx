import CharacterDetail from '@admin/(protected)/darkroom/characters/[slug]/character-detail';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Character Detail');

export default async function CharacterDetailPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <CharacterDetail slug={slug} />
    </Suspense>
  );
}
