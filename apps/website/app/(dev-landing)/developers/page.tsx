import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import DevelopersLandingPage from '@web-components/landing/DevelopersLandingPage';

export const generateMetadata = createPageMetadataWithCanonical(
  'Genfeed for Developers',
  'Open-source content infrastructure for developers. Generate, review, and publish brand-native content on every channel from an MCP server, workflows, or your own self-hosted stack.',
  '/developers',
);

export default function DevelopersPage() {
  return <DevelopersLandingPage />;
}
