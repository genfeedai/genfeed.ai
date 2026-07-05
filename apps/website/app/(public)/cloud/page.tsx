import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import CloudContent from '@public/cloud/cloud-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Teams',
  'One studio for your whole team: shared workspaces, a brand library, roles, and approvals. Start free, then book a demo for team rollout.',
  '/cloud',
);

export default function Cloud() {
  return <CloudContent />;
}
