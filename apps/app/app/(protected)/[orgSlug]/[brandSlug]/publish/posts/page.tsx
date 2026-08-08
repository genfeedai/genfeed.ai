import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import {
  type PostsListSearchParams,
  renderPostsListPage,
} from '../publish-list-page';

export const generateMetadata = createPageMetadata('Posts');

/**
 * Canonical Publish content library — every outbound post across lifecycle
 * states. Pipeline nav items are filtered shortcuts into this desk.
 */
export default async function PublishPostsPage({
  searchParams,
}: {
  searchParams: PostsListSearchParams;
}) {
  return renderPostsListPage({
    searchParams,
    showAllPublicationStates: true,
  });
}
