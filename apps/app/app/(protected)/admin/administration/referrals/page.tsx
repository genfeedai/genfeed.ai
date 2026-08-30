import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import ReferralRewardsList from './referral-rewards-list';

export const generateMetadata = createPageMetadata('Referral Rewards');

export default function ReferralRewardsPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <ReferralRewardsList />
    </Suspense>
  );
}
