import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import AgentLearningContent from './content';

export const generateMetadata = createPageMetadata('Agent learning');

export default function AgentLearningRoute() {
  return <AgentLearningContent />;
}
