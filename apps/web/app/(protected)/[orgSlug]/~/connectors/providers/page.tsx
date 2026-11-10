import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsIntegrationsPage from './content';

export const generateMetadata = createPageMetadata('AI providers');

export default function ConnectorsProvidersRoute() {
  return <SettingsIntegrationsPage />;
}
