import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import ReferralRewardsList from './referral-rewards-list';

export const generateMetadata = createPageMetadata('Referral Rewards');

export default function ReferralRewardsPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <ReferralRewardsList />
    </Suspense>
  );
}
