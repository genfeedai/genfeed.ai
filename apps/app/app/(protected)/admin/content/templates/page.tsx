import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TemplatesPage from '@protected/content/templates/templates-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Templates');

export default function TemplatesPageWrapper() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <TemplatesPage />
    </Suspense>
  );
}
