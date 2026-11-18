import SelfHostedContent from '@public/self-hosted/self-hosted-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Self-Host Genfeed',
  'Genfeed is open source. Self-host it with Docker Compose, point your agent at your own MCP endpoint, and bring your own model provider keys. Or start free on managed cloud.',
  '/self-hosted',
);

export default function SelfHosted() {
  return <SelfHostedContent />;
}
