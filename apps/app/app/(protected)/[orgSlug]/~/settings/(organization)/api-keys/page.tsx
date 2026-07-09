import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsApiKeysPage from '../../(pages)/organization/api-keys/content';
import { SettingsOrganizationRouteShell } from '../SettingsOrganizationRouteShell';

export const generateMetadata = createPageMetadata('API Keys');

export default function SettingsOrganizationApiKeysRoute() {
  return (
    <SettingsOrganizationRouteShell>
      <SettingsApiKeysPage />
    </SettingsOrganizationRouteShell>
  );
}
