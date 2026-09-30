import IntegrationsContent from '@public/integrations/integrations-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Integrations: Publish AI Content Anywhere',
  'Connect Genfeed to YouTube, TikTok, Instagram, LinkedIn, and more. Generate and publish AI content directly to your favorite platforms.',
  '/integrations',
);

export default function Integrations() {
  return <IntegrationsContent />;
}
