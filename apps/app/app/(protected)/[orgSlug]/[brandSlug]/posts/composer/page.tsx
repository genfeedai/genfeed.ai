import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CrossPostComposerPage from './cross-post-composer-page';

export const generateMetadata = createPageMetadata('Cross-Post Composer');

export default function PostsComposerPage() {
  return <CrossPostComposerPage />;
}
