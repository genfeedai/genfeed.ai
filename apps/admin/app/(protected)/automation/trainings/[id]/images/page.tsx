import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrainingImagesTab from '@pages/trainings/tabs/training-images-tab';
import { PageScope } from '@ui-constants/misc.constant';

export const generateMetadata = createPageMetadata('Training Images');

export default function TrainingImagesPage() {
  return <TrainingImagesTab scope={PageScope.SUPERADMIN} />;
}
