import ToolsContent from '@public/tools/tools-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Free AI Content Tools',
  'Use free Genfeed tools to turn a public YouTube video into a timestamped transcript, clip recommendations, an article, or a newsletter.',
  '/tools',
);

export default function ToolsPage(): React.ReactElement {
  return <ToolsContent />;
}
