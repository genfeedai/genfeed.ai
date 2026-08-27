import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import ToolsContent from '@public/tools/tools-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Free AI Content Tools | Genfeed',
  'Try free AI tools for turning long-form content into ready-to-publish social content.',
  '/tools',
);

export default function ToolsPage(): React.ReactElement {
  return <ToolsContent />;
}
