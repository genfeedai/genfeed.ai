import AboutContent from '@public/about/about-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

const ABOUT_DESCRIPTION =
  'Why we built Genfeed in the open: the team, the principles behind the content studio you run from your agent, and where the project is heading next.';

export const generateMetadata = createPageMetadataWithCanonical(
  'About Genfeed: The Content Studio For Your Agent',
  ABOUT_DESCRIPTION,
  '/about',
);

export default function AboutPage() {
  return <AboutContent />;
}
