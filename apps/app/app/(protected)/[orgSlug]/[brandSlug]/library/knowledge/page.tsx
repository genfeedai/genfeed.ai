import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LibraryKnowledgePage from './library-knowledge-page';

export const generateMetadata = createPageMetadata('Knowledge');

export default function LibraryKnowledgeRoute() {
  return <LibraryKnowledgePage />;
}
