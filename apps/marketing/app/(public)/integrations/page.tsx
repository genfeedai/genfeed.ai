import IntegrationsContent from '@public/integrations/integrations-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Integrations: Channels Your Agent Publishes To',
  'Connect YouTube, TikTok, Instagram, LinkedIn and more to Genfeed. Your agent drafts and schedules, you review, and Genfeed publishes to the channels you connect.',
  '/integrations',
);

export default function Integrations() {
  return <IntegrationsContent />;
}
