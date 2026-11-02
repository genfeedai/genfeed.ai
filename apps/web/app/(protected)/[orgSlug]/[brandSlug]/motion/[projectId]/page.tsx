import MotionProjectRoute from '@app/(protected)/[orgSlug]/[brandSlug]/motion/[projectId]/MotionProjectRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Motion project');

export default function StudioMotionProjectPage() {
  return <MotionProjectRoute />;
}
