import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import TrainingImagesTab from './training-images-tab';

export const generateMetadata = createPageMetadata('Training Images');

export default function TrainingImagesPage() {
  return <TrainingImagesTab scope={PageScope.SUPERADMIN} />;
}
