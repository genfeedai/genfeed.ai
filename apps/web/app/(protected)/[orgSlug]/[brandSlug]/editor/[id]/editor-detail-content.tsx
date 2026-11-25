import EditorDetailSurface from '@app/(protected)/[orgSlug]/[brandSlug]/editor/[id]/editor-detail-surface';
import type { DetailPageProps } from '@/props/pages/page.props';

export default async function EditorDetailContent({ params }: DetailPageProps) {
  const { id } = await params;

  return <EditorDetailSurface projectId={id} />;
}
