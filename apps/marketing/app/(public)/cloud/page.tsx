import CloudContent from '@public/cloud/cloud-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Genfeed for Teams: One Shared Studio',
  'One studio for your whole team: shared workspaces, a brand library, roles, and approvals. Start free and connect every teammate’s agent.',
  '/cloud',
);

export default function Cloud() {
  return <CloudContent />;
}
