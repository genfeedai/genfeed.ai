import { PostStatus } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import {
  type PostsListSearchParams,
  renderPostsListPage,
} from '../publishing-list-page';

export const generateMetadata = createPageMetadata('Pending Posts');

export default async function PendingPostsPage({
  searchParams,
}: {
  searchParams: PostsListSearchParams;
}) {
  return renderPostsListPage({
    searchParams,
    statusOverride: PostStatus.PENDING,
  });
}
