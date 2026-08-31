import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsOrganizationPolicyPage from '../../(pages)/organization/policy/content';

export const generateMetadata = createPageMetadata('Organization Agents');

export default function SettingsOrganizationAgentsRoute() {
  return <SettingsOrganizationPolicyPage />;
}
