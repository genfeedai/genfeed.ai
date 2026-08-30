import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SystemEmailsPage from '@protected/administration/system-emails/system-emails-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('System emails');

export default function SystemEmailsRoutePage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <SystemEmailsPage />
    </Suspense>
  );
}
