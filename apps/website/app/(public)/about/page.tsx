import AboutContent from '@public/about/about-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

const ABOUT_DESCRIPTION =
  'Why we built Genfeed in the open: the team, the principles behind our open-source content agent, and where the project is heading next for creators.';

export const generateMetadata = createPageMetadataWithCanonical(
  'About Genfeed: The Open-Source Content Agent',
  ABOUT_DESCRIPTION,
  '/about',
);

export default function AboutPage() {
  return <AboutContent />;
}
