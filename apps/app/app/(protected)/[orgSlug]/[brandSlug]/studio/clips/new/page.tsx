import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

import NewClipProjectPage from './new-clip-project-page';

export const generateMetadata = createPageMetadata('New Clips Project');

export default function StudioClipsNewPage() {
  return <NewClipProjectPage />;
}
