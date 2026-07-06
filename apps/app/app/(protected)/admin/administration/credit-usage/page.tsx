import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CreditUsageList from '@protected/administration/credit-usage/credit-usage-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Credit Usage');

export default function CreditUsagePage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <CreditUsageList />
    </Suspense>
  );
}
