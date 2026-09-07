import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import JourneyPageContent from './journey-page-content';

export const generateMetadata = createPageMetadata('Activation Journey');

export default function ChatJourneyPage() {
  return <JourneyPageContent />;
}
