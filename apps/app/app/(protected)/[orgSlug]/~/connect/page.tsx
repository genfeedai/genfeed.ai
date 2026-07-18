import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ConnectGenfeedFlow from './connect-genfeed-flow';

export const generateMetadata = createPageMetadata('Connect Genfeed');

export default function ConnectGenfeedPage() {
  return <ConnectGenfeedFlow />;
}
