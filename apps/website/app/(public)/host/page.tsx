import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import HostContent from '@public/host/host-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Self-Host',
  'Deploy Genfeed on your own infrastructure. Full platform access, unlimited users, bring your own AI keys. Complete control over your data.',
  '/host',
);

export default function Host() {
  return <HostContent />;
}
