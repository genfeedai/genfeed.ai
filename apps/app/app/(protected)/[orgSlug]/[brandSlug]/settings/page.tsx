import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import BrandDetail from './brand-detail';

export const generateMetadata = createPageMetadata('Brand Profile');

export default function BrandDetailPage() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <BrandDetail />
    </Suspense>
  );
}
