import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsApiKeysPage from '../../(pages)/organization/api-keys/content';

export const generateMetadata = createPageMetadata('API Keys');

export default function SettingsOrganizationApiKeysRoute() {
  return <SettingsApiKeysPage />;
}
