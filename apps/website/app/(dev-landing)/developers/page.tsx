import DevelopersLandingPage from '@web-components/landing/DevelopersLandingPage';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Distribution for Developers',
  'Connect your agent to Genfeed through MCP for content drafts, media and publishing. Use managed cloud or run the open-source stack yourself.',
  '/developers',
);

export default function DevelopersPage() {
  return <DevelopersLandingPage />;
}
