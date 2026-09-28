import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import ToolsContent from '@public/tools/tools-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Free AI Content Tools',
  'Use free Genfeed tools to turn a public YouTube video into a timestamped transcript, clip recommendations, an article, or a newsletter.',
  '/tools',
);

export default function ToolsPage(): React.ReactElement {
  return <ToolsContent />;
}
