import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FeatureGate from '@ui/guards/feature/FeatureGate';

import NewClipProjectPage from './new-clip-project-page';

export const generateMetadata = createPageMetadata('New Clips Project');

export default function StudioClipsNewPage() {
  return (
    <FeatureGate flagKey="studio">
      <NewClipProjectPage />
    </FeatureGate>
  );
}
