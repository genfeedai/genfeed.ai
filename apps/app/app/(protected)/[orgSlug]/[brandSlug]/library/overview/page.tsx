import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LibraryOverviewPage from './library-overview-page';

export const generateMetadata = createPageMetadata('Library Overview');

export default function LibraryOverviewRoute() {
  return <LibraryOverviewPage />;
}
