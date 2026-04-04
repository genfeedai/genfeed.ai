import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import DemoContent from '@public/demo/demo-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Demo',
  'See Genfeed in action. Watch how AI agents create professional videos, images, and marketing content in minutes, not hours.',
  '/demo',
);

export default function DemoPage() {
  return <DemoContent />;
}
