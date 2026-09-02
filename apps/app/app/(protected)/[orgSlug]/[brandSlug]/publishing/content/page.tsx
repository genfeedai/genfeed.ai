import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PublishingContentLibrary from '@pages/posts/library/publishing-content-library';

export const generateMetadata = createPageMetadata('Content library');

/**
 * Type-aware content library — social posts, articles, and newsletters
 * federated into one table. Distinct from the Posts lifecycle list at
 * `/publishing/posts`, which is social-post-only.
 */
export default function PublishingContentPage() {
  return <PublishingContentLibrary />;
}
