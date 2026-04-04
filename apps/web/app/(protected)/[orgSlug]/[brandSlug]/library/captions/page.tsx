import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import CaptionsList from '@pages/captions/list/captions-list';
import LibraryCaptionsShell from '@pages/library/captions/library-captions-page';
import LazyLoadingFallback from '@ui/loading/fallback/LazyLoadingFallback';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Captions');

export default function LibraryCaptionsPage() {
  return (
    <LibraryCaptionsShell>
      <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
        <CaptionsList />
      </Suspense>
    </LibraryCaptionsShell>
  );
}
