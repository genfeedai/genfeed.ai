import { PostStatus } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import {
  type PostsListSearchParams,
  renderPostsListPage,
} from '../publishing-list-page';

export const generateMetadata = createPageMetadata('Failed Posts');

export default async function FailedPostsPage({
  searchParams,
}: {
  searchParams: PostsListSearchParams;
}) {
  return renderPostsListPage({
    searchParams,
    statusOverride: PostStatus.FAILED,
  });
}
