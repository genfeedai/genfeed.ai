import EditorDetailSurface from '@app/(protected)/[orgSlug]/[brandSlug]/editor/[id]/editor-detail-surface';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { DetailPageProps } from '@props/pages/page.props';

export const generateMetadata = createPageMetadata('Editor');

export default async function EditorDetailPage({ params }: DetailPageProps) {
  const { id } = await params;

  return <EditorDetailSurface projectId={id} />;
}
