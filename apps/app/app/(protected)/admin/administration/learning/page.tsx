import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LearningPage from '@protected/administration/learning/learning-page';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Learning');

export default function LearningRoutePage() {
  return (
    <Suspense fallback={null}>
      <LearningPage />
    </Suspense>
  );
}
