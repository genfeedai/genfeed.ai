import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BatchProjectsPage from '@/features/workflows/pages/batch/BatchProjectsPage';
export const generateMetadata = createPageMetadata('Batch');
export default function StudioBatchPage() {
  return <BatchProjectsPage />;
}
