import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PublishingContentLibrary from '@/features/posts/library/publishing-content-library';

export const generateMetadata = createPageMetadata('Posts');

export default function PublishingPostsPage() {
  return <PublishingContentLibrary />;
}
