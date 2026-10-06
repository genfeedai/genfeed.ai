import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BrandContentRulesPage from './content';

export const generateMetadata = createPageMetadata('Content rules');

export default function BrandContentRulesRoute() {
  return <BrandContentRulesPage />;
}
