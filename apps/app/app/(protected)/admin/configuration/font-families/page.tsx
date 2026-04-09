import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import FontFamiliesList from './font-families-list';

export const generateMetadata = createPageMetadata('Font Families');

export default function FontFamiliesPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <FontFamiliesList scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
