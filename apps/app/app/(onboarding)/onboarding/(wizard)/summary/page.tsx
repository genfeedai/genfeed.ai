import SummaryContent from '@app/(onboarding)/onboarding/(wizard)/summary/summary-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Installation Summary');

export default function SummaryPage() {
  return <SummaryContent />;
}
