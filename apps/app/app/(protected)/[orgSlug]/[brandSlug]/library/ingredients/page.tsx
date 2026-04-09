import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LibraryLandingPage from './library-landing-page';

export const generateMetadata = createPageMetadata('Library');

export default function LibraryIngredientsPage() {
  return <LibraryLandingPage />;
}
