import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsUsagePage from '../../(pages)/organization/usage/content';

export const generateMetadata = createPageMetadata('Cost & Usage');

export default function SettingsOrganizationUsageRoute() {
  return <SettingsUsagePage />;
}
