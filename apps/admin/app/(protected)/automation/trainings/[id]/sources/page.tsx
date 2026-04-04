import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrainingSourcesTab from '@pages/trainings/tabs/training-sources-tab';

export const generateMetadata = createPageMetadata('Training Sources');

export default function TrainingSourcesPage() {
  return <TrainingSourcesTab />;
}
