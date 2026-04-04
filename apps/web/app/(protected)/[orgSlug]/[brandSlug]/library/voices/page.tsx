import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LibraryVoicesPage from '@pages/library/voices/library-voices-page';

export const generateMetadata = createPageMetadata('Voices');

export default function LibraryVoicesRoute() {
  return <LibraryVoicesPage />;
}
