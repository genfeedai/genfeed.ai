import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import CloudContent from '@public/cloud/cloud-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Cloud App',
  'Managed Genfeed app for content creation, publishing, and pay-as-you-go output. Start with cloud access, then book a demo for team rollout.',
  '/cloud',
);

export default function Cloud() {
  return <CloudContent />;
}
