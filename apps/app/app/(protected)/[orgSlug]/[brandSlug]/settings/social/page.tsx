import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import BrandSettingsSocialPage from './content';

export const generateMetadata = createPageMetadata('Social accounts');

export default function BrandSettingsSocialRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <BrandSettingsSocialPage />
    </Suspense>
  );
}
