import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LensesPageContent from './lenses-page-content';

export const generateMetadata = createPageMetadata('Lenses');

export default function LensesPage() {
  return <LensesPageContent />;
}
