import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsOrganizationPage from '../(pages)/organization/content';
import { SettingsOrganizationRouteShell } from './SettingsOrganizationRouteShell';

export const generateMetadata = createPageMetadata('Organization Settings');

export default function SettingsOrgPage() {
  return (
    <SettingsOrganizationRouteShell>
      <SettingsOrganizationPage />
    </SettingsOrganizationRouteShell>
  );
}
