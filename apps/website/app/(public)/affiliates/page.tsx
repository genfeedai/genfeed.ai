import AffiliatesContent from '@public/affiliates/affiliates-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Genfeed Affiliates',
  'Share your Genfeed link and earn credits equal to 10% of what each account you refer spends on credits, for 12 months from their signup.',
  '/affiliates',
);

export default function Affiliates() {
  return <AffiliatesContent />;
}
