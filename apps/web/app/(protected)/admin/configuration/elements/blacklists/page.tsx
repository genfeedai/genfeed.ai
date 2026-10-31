import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import BlacklistsPageContent from './blacklists-page-content';

export const generateMetadata = createPageMetadata('Blacklists');

export default function BlacklistsPage() {
  return <BlacklistsPageContent />;
}
