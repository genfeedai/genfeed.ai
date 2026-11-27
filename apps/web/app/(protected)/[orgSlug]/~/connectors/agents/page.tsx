import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ConnectorsAgentsContent from './content';

export const generateMetadata = createPageMetadata('Connect Genfeed');

export default function ConnectorsAgentsPage() {
  return <ConnectorsAgentsContent />;
}
