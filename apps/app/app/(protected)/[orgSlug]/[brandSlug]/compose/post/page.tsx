import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PostsWritePage from './posts-write-page';

export const generateMetadata = createPageMetadata('Compose Post');

export default function ComposePostRoute() {
  return <PostsWritePage />;
}
