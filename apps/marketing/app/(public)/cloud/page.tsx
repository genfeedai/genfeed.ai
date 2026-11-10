import CloudContent from '@public/cloud/cloud-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Genfeed for Teams: One Shared Workspace',
  'One workspace for your team’s agents: a shared brand library, roles, approvals and credits. Each teammate connects an agent; shared seats start on Scale.',
  '/cloud',
);

export default function Cloud() {
  return <CloudContent />;
}
