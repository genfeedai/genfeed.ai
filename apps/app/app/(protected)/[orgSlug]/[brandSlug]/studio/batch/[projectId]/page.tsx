import StudioBatchProjectRoute from '@app/(protected)/[orgSlug]/[brandSlug]/studio/batch/[projectId]/StudioBatchProjectRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Batch project');

export default function StudioBatchProjectPage() {
  return <StudioBatchProjectRoute />;
}
