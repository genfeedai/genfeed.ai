import { PageScope } from '@genfeedai/contracts';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import MessagesOverview from './messages-overview';

export const generateMetadata = createPageMetadata('Messages Overview');

export default function MessagesOverviewPage() {
  return <MessagesOverview scope={PageScope.BRAND} />;
}
