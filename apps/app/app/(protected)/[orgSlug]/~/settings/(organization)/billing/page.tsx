import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsBillingPage from '../../(pages)/organization/billing/content';
import { SettingsOrganizationRouteShell } from '../SettingsOrganizationRouteShell';

export const generateMetadata = createPageMetadata('Billing Settings');

export default function SettingsOrganizationBillingRoute() {
  return (
    <SettingsOrganizationRouteShell>
      <SettingsBillingPage />
    </SettingsOrganizationRouteShell>
  );
}
