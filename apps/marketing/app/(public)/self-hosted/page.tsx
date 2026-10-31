import SelfHostedContent from '@public/self-hosted/self-hosted-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Self-Host Genfeed',
  'Genfeed is open source. Self-host it with Docker Compose using one npx command or a checksummed release bundle, bring your own model provider keys, or start free on managed cloud.',
  '/self-hosted',
);

export default function SelfHosted() {
  return <SelfHostedContent />;
}
