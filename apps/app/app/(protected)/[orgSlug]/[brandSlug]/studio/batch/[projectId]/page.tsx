import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BatchProjectPage from '@/features/workflows/pages/batch/BatchProjectPage';
export const generateMetadata = createPageMetadata('Batch project');
export default async function StudioBatchProjectPage({
  params,
}: {
  params: Promise<{ projectId: string }>;
}) {
  const { projectId } = await params;
  return <BatchProjectPage key={projectId} projectId={projectId} />;
}
