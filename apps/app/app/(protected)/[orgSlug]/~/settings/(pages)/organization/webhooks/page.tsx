import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';
import SettingsWebhooksPage from './content';

export const generateMetadata = createPageMetadata('Webhooks');

export default function SettingsOrganizationWebhooksRoute() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SettingsWebhooksPage />
    </Suspense>
  );
}
