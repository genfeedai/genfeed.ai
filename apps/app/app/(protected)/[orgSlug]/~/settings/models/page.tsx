import ModelsCatalogRoute from '@app/(protected)/[orgSlug]/~/settings/models/ModelsCatalogRoute';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Models');

export default function ModelsCatalogPage() {
  return (
    <Suspense fallback={null}>
      <ModelsCatalogRoute />
    </Suspense>
  );
}
