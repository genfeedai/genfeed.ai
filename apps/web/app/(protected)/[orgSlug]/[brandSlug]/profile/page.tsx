import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandDetail from './brand-detail';

export const generateMetadata = createPageMetadata('Brand Profile');

export default function BrandDetailPage() {
  return (
    <Suspense fallback={null}>
      <BrandDetail />
    </Suspense>
  );
}
