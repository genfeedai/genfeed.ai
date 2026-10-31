import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandsList from './brands-list';

export const generateMetadata = createPageMetadata('Brands');

export default function BrandsPage() {
  return <BrandsList />;
}
