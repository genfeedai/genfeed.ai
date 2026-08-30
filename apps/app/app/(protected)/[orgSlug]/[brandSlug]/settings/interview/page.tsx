import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';
import BrandSettingsInterviewPage from './content';

export const generateMetadata = createPageMetadata('Brand Interview');

export default function BrandSettingsInterviewRoute() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <BrandSettingsInterviewPage />
    </Suspense>
  );
}
