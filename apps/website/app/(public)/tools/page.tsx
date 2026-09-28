import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import ToolsContent from '@public/tools/tools-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Free AI Content Tools',
  'Turn long-form content into social posts, short clips, articles, and newsletters with free Genfeed AI tools. Preview the output before you publish.',
  '/tools',
);

export default function ToolsPage(): React.ReactElement {
  return <ToolsContent />;
}
