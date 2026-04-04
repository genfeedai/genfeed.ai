import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SubscriptionsList from '@protected/administration/subscriptions/subscriptions-list';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Subscriptions');

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <SubscriptionsList />
    </Suspense>
  );
}
