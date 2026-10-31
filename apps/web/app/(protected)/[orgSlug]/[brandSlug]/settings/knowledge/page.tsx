import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import BrandSettingsKnowledgePage from './content';

export const generateMetadata = createPageMetadata('Knowledge');

export default function BrandSettingsKnowledgeRoute() {
  return (
    <Suspense fallback={null}>
      <BrandSettingsKnowledgePage />
    </Suspense>
  );
}
