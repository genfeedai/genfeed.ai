import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import type { PostsListSearchParams } from '../publishing-list-page';
import { renderPostsListPage } from '../publishing-list-page';

export const generateMetadata = createPageMetadata('Posts');

/**
 * Canonical Publishing posts library — every outbound social post across
 * lifecycle states. Pipeline nav shortcuts are filtered query-param links
 * into this single desk; there is no dedicated route per lifecycle state.
 */
export default async function PublishingPostsPage({
  searchParams,
}: {
  searchParams: PostsListSearchParams;
}) {
  return renderPostsListPage({ searchParams });
}
