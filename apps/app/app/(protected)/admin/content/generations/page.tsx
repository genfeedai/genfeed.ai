import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import GenerationsPage from '@protected/content/generations/generations-page';

export const generateMetadata = createPageMetadata('Generations');

export default function GenerationsPageWrapper() {
  return <GenerationsPage />;
}
