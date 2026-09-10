import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import AgentContent from '@public/agent/agent-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Genfeed Agent — ask for content, get it published',
  'Tell the Genfeed agent what you want. It makes the video, images, ads and posts, keeps them on brand, and schedules them to 20+ channels — with every output in review before it goes out.',
  '/agent',
);

export default function Agent() {
  return <AgentContent />;
}
