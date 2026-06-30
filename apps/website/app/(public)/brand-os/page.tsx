import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import BrandOSContent from '@public/brand-os/brand-os-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Brand OS',
  'Build a source-backed Brand OS preview with evidence, diagnostics, scale roles, and save-to-Genfeed conversion states.',
  '/brand-os',
);

export default function BrandOSPage() {
  return <BrandOSContent />;
}
