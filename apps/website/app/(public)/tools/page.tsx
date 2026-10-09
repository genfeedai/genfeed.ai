import ToolsContent from '@public/tools/tools-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Free AI Tools for Models and Content Creation',
  'Choose an AI model, turn YouTube into an article or newsletter, and find clips with free Genfeed content tools. Useful results before signup.',
  '/tools',
);

export default function ToolsPage(): React.ReactElement {
  return <ToolsContent />;
}
