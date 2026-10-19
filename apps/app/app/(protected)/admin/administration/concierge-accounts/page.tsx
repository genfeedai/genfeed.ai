import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import WarmupAccountsPage from '@protected/administration/concierge-accounts/warmup-accounts-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Concierge Accounts');

export default function WarmupAccountsRoutePage() {
  return (
    <Suspense fallback={null}>
      <WarmupAccountsPage />
    </Suspense>
  );
}
