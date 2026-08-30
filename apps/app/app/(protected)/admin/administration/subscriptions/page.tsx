import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SubscriptionsList from '@protected/administration/subscriptions/subscriptions-list';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Subscriptions');

export default function SubscriptionsPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <SubscriptionsList />
    </Suspense>
  );
}
