import MarketplacePage from '@admin/(protected)/marketplace/marketplace-page';
import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Marketplace');

export default function Page() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <MarketplacePage />
    </Suspense>
  );
}
