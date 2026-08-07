import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsIntegrationsPage from '../../(pages)/organization/integrations/content';
import { SettingsOrganizationRouteShell } from '../SettingsOrganizationRouteShell';

export const generateMetadata = createPageMetadata('Integrations');

export default function SettingsOrganizationIntegrationsRoute() {
  return (
    <SettingsOrganizationRouteShell>
      <SettingsIntegrationsPage />
    </SettingsOrganizationRouteShell>
  );
}
