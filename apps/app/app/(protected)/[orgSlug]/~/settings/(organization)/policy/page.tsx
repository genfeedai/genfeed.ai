import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsOrganizationPolicyPage from '../../(pages)/organization/policy/content';
import { SettingsOrganizationRouteShell } from '../SettingsOrganizationRouteShell';

export const generateMetadata = createPageMetadata('Organization Policy');

export default function SettingsOrganizationPolicyRoute() {
  return (
    <SettingsOrganizationRouteShell>
      <SettingsOrganizationPolicyPage />
    </SettingsOrganizationRouteShell>
  );
}
