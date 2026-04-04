import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import CloudContent from '@public/cloud/cloud-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Cloud',
  'Managed AI platform for teams. Zero DevOps, enterprise features, premium AI models included. Start creating content in minutes.',
  '/cloud',
);

export default function Cloud() {
  return <CloudContent />;
}
