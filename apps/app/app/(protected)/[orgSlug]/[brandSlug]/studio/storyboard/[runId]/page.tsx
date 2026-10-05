import StudioStoryboardRunRoute from '@app/(protected)/[orgSlug]/[brandSlug]/studio/storyboard/[runId]/StudioStoryboardRunRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Storyboard run');

export default function StudioStoryboardRunPage() {
  return <StudioStoryboardRunRoute />;
}
