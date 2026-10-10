import StudioTurboProjectRoute from '@app/(protected)/[orgSlug]/[brandSlug]/studio/turbo/[projectId]/StudioTurboProjectRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Batch project');

export default function StudioTurboProjectPage() {
  return <StudioTurboProjectRoute />;
}
