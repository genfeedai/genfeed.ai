import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsWebhooksPage from '../../(pages)/organization/webhooks/content';

export const generateMetadata = createPageMetadata('Webhooks');

export default function SettingsOrganizationWebhooksRoute() {
  return <SettingsWebhooksPage />;
}
