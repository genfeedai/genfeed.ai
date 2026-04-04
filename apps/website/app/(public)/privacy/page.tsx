import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import PrivacyContent from '@public/privacy/privacy-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Privacy Policy',
  'Learn how Genfeed.ai handles your data, privacy protections, content ownership rights, and our commitment to keeping your information secure.',
  '/privacy',
);

export default function PrivacyPage() {
  return <PrivacyContent />;
}
