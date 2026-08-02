import {
  type ArtifactEditorType,
  isArtifactEditorType,
} from '@genfeedai/constants';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import ArtifactEditor from './artifact-editor';

interface ArtifactEditorPageProps {
  params: Promise<{ id: string; type: string }>;
}

const ARTIFACT_EDITOR_TITLES: Record<ArtifactEditorType, string> = {
  article: 'Edit Article',
  newsletter: 'Edit Newsletter',
  post: 'Edit Post',
};

export const generateMetadata = createDynamicPageMetadata('type', (type) =>
  isArtifactEditorType(type) ? ARTIFACT_EDITOR_TITLES[type] : 'Edit Draft',
);

export default async function ArtifactEditorPage({
  params,
}: ArtifactEditorPageProps) {
  const { id, type } = await params;

  if (!isArtifactEditorType(type)) {
    notFound();
  }

  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ArtifactEditor artifactId={id} type={type} />
    </Suspense>
  );
}
