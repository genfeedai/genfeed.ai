import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TwitterPipelineEngage from '@pages/twitter-pipeline/twitter-pipeline-engage';

export const generateMetadata = createPageMetadata('Twitter Engage');

export default function LabTwitterEngagePage() {
  return <TwitterPipelineEngage />;
}
