import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import CaptionsList from './captions-list';
import LibraryCaptionsShell from './library-captions-page';

export const generateMetadata = createPageMetadata('Captions');

export default function LibraryCaptionsPage() {
  return (
    <LibraryCaptionsShell>
      <Suspense fallback={<PageLoadingState />}>
        <CaptionsList />
      </Suspense>
    </LibraryCaptionsShell>
  );
}
