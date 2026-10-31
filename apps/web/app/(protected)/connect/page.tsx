import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ConnectRouteResolver from './connect-route-resolver';

export const generateMetadata = createPageMetadata('Connect');

export default function ConnectPage() {
  return <ConnectRouteResolver />;
}
