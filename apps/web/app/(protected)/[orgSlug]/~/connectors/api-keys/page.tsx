import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsApiKeysPage from './content';

export const generateMetadata = createPageMetadata('API keys');

export default function ConnectorsApiKeysRoute() {
  return <SettingsApiKeysPage />;
}
