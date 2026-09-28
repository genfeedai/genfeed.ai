import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import DevelopersLandingPage from '@web-components/landing/DevelopersLandingPage';

export const generateMetadata = createPageMetadataWithCanonical(
  'Genfeed for Developers',
  'Build with open-source content infrastructure: generate, review, and publish on-brand content through MCP, workflows, or your self-hosted Genfeed stack.',
  '/developers',
);

export default function DevelopersPage() {
  return <DevelopersLandingPage />;
}
