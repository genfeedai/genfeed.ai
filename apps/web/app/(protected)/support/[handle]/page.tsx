import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SupportRouteResolver from './support-route-resolver';

export const generateMetadata = createPageMetadata('Support a creator');

export default function SupportPage() {
  return <SupportRouteResolver />;
}
