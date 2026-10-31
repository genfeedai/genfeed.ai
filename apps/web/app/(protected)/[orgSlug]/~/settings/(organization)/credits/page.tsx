import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsCreditsPage from '../../(pages)/organization/credits/content';

export const generateMetadata = createPageMetadata('Credits Settings');

export default function SettingsOrganizationCreditsRoute() {
  return <SettingsCreditsPage />;
}
