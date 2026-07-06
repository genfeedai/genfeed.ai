import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import SelfHostedContent from '@public/self-hosted/self-hosted-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Self-Host Genfeed',
  'Genfeed is open source. Self-host the full content OS on your own infrastructure with Docker — or skip the ops and start free on managed cloud.',
  '/self-hosted',
);

export default function SelfHosted() {
  return <SelfHostedContent />;
}
