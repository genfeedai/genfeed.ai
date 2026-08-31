import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import PromptsPage from '@protected/content/prompts/list/prompts-page';
import PageLoadingState from '@ui/loading/page/PageLoadingState';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Prompts');

export default function PromptsPageWrapper() {
  return (
    <Suspense fallback={<PageLoadingState />}>
      <PromptsPage />
    </Suspense>
  );
}
