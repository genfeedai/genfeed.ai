import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import CaptionsList from './captions-list';
import LibraryCaptionsShell from './library-captions-page';

export const generateMetadata = createPageMetadata('Captions');

export default function LibraryCaptionsPage() {
  return (
    <LibraryCaptionsShell>
      <Suspense fallback={null}>
        <CaptionsList />
      </Suspense>
    </LibraryCaptionsShell>
  );
}
