import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CliAuthPage from './content';

export const generateMetadata = createPageMetadata('CLI OAuth');

export default function CliAuthRoute() {
  return <CliAuthPage />;
}
