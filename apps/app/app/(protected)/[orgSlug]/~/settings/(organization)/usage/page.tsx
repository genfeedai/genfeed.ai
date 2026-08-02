import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsUsagePage from '../../(pages)/organization/usage/content';
import { SettingsOrganizationRouteShell } from '../SettingsOrganizationRouteShell';

export const generateMetadata = createPageMetadata('Usage');

export default function SettingsOrganizationUsageRoute() {
  return (
    <SettingsOrganizationRouteShell>
      <SettingsUsagePage />
    </SettingsOrganizationRouteShell>
  );
}
