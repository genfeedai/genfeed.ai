import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CreditUsageList from '@protected/administration/credit-usage/credit-usage-list';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Credit Usage');

export default function CreditUsagePage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <CreditUsageList />
    </Suspense>
  );
}
