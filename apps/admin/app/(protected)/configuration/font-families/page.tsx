import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FontFamiliesList from '@pages/elements/font-families/font-families-list';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Font Families');

export default function FontFamiliesPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <FontFamiliesList scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
