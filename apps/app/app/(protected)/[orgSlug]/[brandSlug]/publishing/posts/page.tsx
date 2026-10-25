import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PublishingContentLibrary from '@pages/posts/library/publishing-content-library';

export const generateMetadata = createPageMetadata('Posts');

export default function PublishingPostsPage() {
  return <PublishingContentLibrary />;
}
