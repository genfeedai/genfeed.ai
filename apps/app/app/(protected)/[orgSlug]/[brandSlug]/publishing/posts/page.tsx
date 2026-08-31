import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PublishingContentLibrary from '@pages/posts/library/publishing-content-library';

export const generateMetadata = createPageMetadata('Posts');

/**
 * Canonical Publishing content library — every outbound post across lifecycle
 * states. Pipeline nav items are filtered shortcuts into this desk.
 */
export default function PublishingPostsPage() {
  return <PublishingContentLibrary />;
}
