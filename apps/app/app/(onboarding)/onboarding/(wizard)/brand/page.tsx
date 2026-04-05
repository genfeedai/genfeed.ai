import BrandContent from '@app/(onboarding)/onboarding/(wizard)/brand/brand-content';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createPageMetadata('Brand Setup');

export default function BrandPage() {
  return <BrandContent />;
}
