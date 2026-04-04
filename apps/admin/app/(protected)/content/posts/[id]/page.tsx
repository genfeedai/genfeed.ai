import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PostDetail from '@pages/posts/detail/post-detail';
import type { DetailPageProps } from '@props/pages/page.props';
import { PageScope } from '@ui-constants/misc.constant';

export const generateMetadata = createPageMetadata('Post Performance');

export default async function PostDetailPage({ params }: DetailPageProps) {
  const { id } = await params;

  return <PostDetail postId={id} scope={PageScope.SUPERADMIN} />;
}
