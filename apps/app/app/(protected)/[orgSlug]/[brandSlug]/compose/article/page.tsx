import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ArticleCompose from '@pages/articles/compose/article-compose';

export const generateMetadata = createPageMetadata('Compose Article');

export default function ComposeArticleRoute() {
  return <ArticleCompose />;
}
