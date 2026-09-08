import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import StylesPageContent from './styles-page-content';

export const generateMetadata = createPageMetadata('Styles');

export default function StylesPage() {
  return <StylesPageContent />;
}
