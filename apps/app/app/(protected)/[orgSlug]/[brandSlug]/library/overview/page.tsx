import { PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LibraryOverview from '@pages/library/overview/library-overview';

export const generateMetadata = createPageMetadata('Library Overview');

export default function LibraryOverviewPage() {
  return <LibraryOverview scope={PageScope.BRAND} />;
}
