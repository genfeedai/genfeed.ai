import DevelopersLandingPage from '@web-components/landing/DevelopersLandingPage';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Genfeed for Developers',
  'Build with open-source content infrastructure: generate, review, and publish on-brand content through MCP, workflows, or your self-hosted Genfeed stack.',
  '/developers',
);

export default function DevelopersPage() {
  return <DevelopersLandingPage />;
}
