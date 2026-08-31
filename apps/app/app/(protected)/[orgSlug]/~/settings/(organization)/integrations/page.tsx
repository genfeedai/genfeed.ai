import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsIntegrationsPage from '../../(pages)/organization/integrations/content';

export const generateMetadata = createPageMetadata('Integrations');

export default function SettingsOrganizationIntegrationsRoute() {
  return <SettingsIntegrationsPage />;
}
