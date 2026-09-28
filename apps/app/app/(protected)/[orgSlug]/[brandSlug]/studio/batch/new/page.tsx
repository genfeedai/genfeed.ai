import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BatchNewProjectPage from '@/features/workflows/pages/batch/BatchNewProjectPage';
export const generateMetadata = createPageMetadata('New Batch');
export default function StudioBatchNewPage() {
  return <BatchNewProjectPage />;
}
