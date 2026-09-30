import PrivacyContent from '@public/privacy/privacy-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Privacy Policy: Data and Content',
  'Learn how Genfeed.ai handles your data, privacy protections, content ownership rights, and our commitment to keeping your information secure.',
  '/privacy',
);

export default function PrivacyPage() {
  return <PrivacyContent />;
}
