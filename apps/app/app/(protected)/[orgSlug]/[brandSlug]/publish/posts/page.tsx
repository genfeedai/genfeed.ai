import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PublishContentLibrary from '@pages/posts/library/publish-content-library';

export const generateMetadata = createPageMetadata('Posts');

/**
 * Canonical Publish content library — every outbound post across lifecycle
 * states. Pipeline nav items are filtered shortcuts into this desk.
 */
export default function PublishPostsPage() {
  return <PublishContentLibrary />;
}
