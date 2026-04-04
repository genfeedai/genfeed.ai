import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AiInfluencersContent from '@public/influencers/ai-influencers-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'AI Influencer Platform',
  'Create AI influencers that post, engage, and grow audiences 24/7. Build virtual influencers with AI avatars, voice cloning, and automated content pipelines.',
  '/influencers',
);

export default function Influencers() {
  return <AiInfluencersContent />;
}
