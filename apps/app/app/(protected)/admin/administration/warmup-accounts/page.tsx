import { SkeletonLoadingFallback } from '@components/loading/skeleton/SkeletonFallbacks';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import WarmupAccountsPage from '@protected/administration/warmup-accounts/warmup-accounts-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Warm-up accounts');

export default function WarmupAccountsRoutePage() {
  return (
    <Suspense fallback={<SkeletonLoadingFallback />}>
      <WarmupAccountsPage />
    </Suspense>
  );
}
