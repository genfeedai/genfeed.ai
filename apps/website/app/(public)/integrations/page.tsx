import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import IntegrationsContent from '@public/integrations/integrations-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Integrations — Publish AI Content to Every Platform',
  'Connect Genfeed to YouTube, TikTok, Instagram, LinkedIn, and more. Generate and publish AI content directly to your favorite platforms.',
  '/integrations',
);

export default function Integrations() {
  return <IntegrationsContent />;
}
