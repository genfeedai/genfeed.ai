import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TwitterPipelineEngage from '@pages/twitter-pipeline/twitter-pipeline-engage';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Twitter Engage');

export default function LabTwitterEngagePage() {
  return (
    <Suspense fallback={null}>
      <TwitterPipelineEngage />
    </Suspense>
  );
}
