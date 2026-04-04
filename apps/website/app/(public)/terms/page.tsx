import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import TermsPageContent from '@public/terms/terms-page';

export const generateMetadata = createPageMetadataWithCanonical(
  'Terms & Conditions',
  'Read the terms and conditions for using the Genfeed.ai platform, including content ownership, usage policies, and service agreements.',
  '/terms',
);

export default function Terms() {
  return <TermsPageContent />;
}
