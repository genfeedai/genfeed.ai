import PostDetailRoute from '@app/(protected)/admin/content/posts/[id]/PostDetailRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Post Performance');

export default function PostDetailPage() {
  return <PostDetailRoute />;
}
