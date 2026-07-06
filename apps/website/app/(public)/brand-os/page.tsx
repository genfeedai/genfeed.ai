import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import BrandOSContent from '@public/brand-os/brand-os-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Brand OS: Genfeed Design System',
  "Genfeed's Brand OS: the dark-first design system behind the product. Color layers, semantic and platform tokens, the type scale, and the content-is-the-accent principle.",
  '/brand-os',
);

export default function BrandOSPage() {
  return <BrandOSContent />;
}
