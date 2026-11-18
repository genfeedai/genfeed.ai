import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SettingsWebhooksPage from './content';

export const generateMetadata = createPageMetadata('Webhooks');

export default function ConnectorsWebhooksRoute() {
  return <SettingsWebhooksPage />;
}
