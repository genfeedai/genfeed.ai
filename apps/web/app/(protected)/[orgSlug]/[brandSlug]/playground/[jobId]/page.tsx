import StudioPlaygroundJobRoute from '@app/(protected)/[orgSlug]/[brandSlug]/playground/[jobId]/StudioPlaygroundJobRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Playground generation');

export default function StudioPlaygroundJobPage() {
  return <StudioPlaygroundJobRoute />;
}
