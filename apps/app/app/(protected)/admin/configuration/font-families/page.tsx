import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import FontFamiliesList from './font-families-list';

export const generateMetadata = createPageMetadata('Font Families');

export default function FontFamiliesPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <FontFamiliesList scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
