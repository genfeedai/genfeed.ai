import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsCreditsPage from '../../(pages)/organization/credits/content';
import { SettingsOrganizationRouteShell } from '../SettingsOrganizationRouteShell';

export const generateMetadata = createPageMetadata('Credits Settings');

export default function SettingsOrganizationCreditsRoute() {
  return (
    <SettingsOrganizationRouteShell>
      <SettingsCreditsPage />
    </SettingsOrganizationRouteShell>
  );
}
