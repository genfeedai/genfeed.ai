import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PromptsPage from '@protected/content/prompts/list/prompts-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Prompts');

export default function PromptsPageWrapper() {
  return (
    <Suspense fallback={null}>
      <PromptsPage />
    </Suspense>
  );
}
