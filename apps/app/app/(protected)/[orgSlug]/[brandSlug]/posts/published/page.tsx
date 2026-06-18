import { PostStatus } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import {
  type PostsListSearchParams,
  renderPostsListPage,
} from '../posts-list-page';

export const generateMetadata = createPageMetadata('Published Posts');

export default async function PublishedPostsPage({
  searchParams,
}: {
  searchParams: PostsListSearchParams;
}) {
  return renderPostsListPage({
    searchParams,
    statusOverride: PostStatus.PUBLIC,
  });
}
