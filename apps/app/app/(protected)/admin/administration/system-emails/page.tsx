import { SkeletonLoadingFallback } from '@components/loading/skeleton/SkeletonFallbacks';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import SystemEmailsPage from '@protected/administration/system-emails/system-emails-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('System emails');

export default function SystemEmailsRoutePage() {
  return (
    <Suspense fallback={<SkeletonLoadingFallback />}>
      <SystemEmailsPage />
    </Suspense>
  );
}
