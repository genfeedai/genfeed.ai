import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsOrganizationPage from '../../(pages)/organization/content';
import { SettingsOrganizationRouteShell } from '../SettingsOrganizationRouteShell';

export const generateMetadata = createPageMetadata('Organization Settings');

/**
 * Org settings home — complete path `/settings/profile` (sidebar label: General).
 * Bare `~/settings` permanently redirects here (same complete-path pattern as
 * brand settings → profile and workspace → overview).
 */
export default function SettingsOrganizationProfileRoute() {
  return (
    <SettingsOrganizationRouteShell>
      <SettingsOrganizationPage />
    </SettingsOrganizationRouteShell>
  );
}
