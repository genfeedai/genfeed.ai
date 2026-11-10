import CloudContent from '@public/cloud/cloud-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Genfeed for Teams: One Shared Workspace',
  'One workspace for your whole team’s agents: a shared brand library, roles, approvals and a credit pool. Start free and connect every teammate’s agent.',
  '/cloud',
);

export default function Cloud() {
  return <CloudContent />;
}
