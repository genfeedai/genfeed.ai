import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import {
  type PostsListSearchParams,
  renderPostsListPage,
} from '../publish-list-page';

export const generateMetadata = createPageMetadata('Not posted');

/**
 * Draft / scheduled / in-progress posts library (not live yet).
 * Was a redirect to Overview; Overview is now the Publish dashboard.
 */
export default async function ScheduledPostsPage({
  searchParams,
}: {
  searchParams: PostsListSearchParams;
}) {
  return renderPostsListPage({
    publicationStateOverride: 'not-posted',
    searchParams,
  });
}
