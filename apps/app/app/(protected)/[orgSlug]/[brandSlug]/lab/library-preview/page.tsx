import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import LibraryLandingVisualPreview from '@pages/library/landing/library-landing-visual-preview';

export const generateMetadata = createPageMetadata('Library Preview');

export default function LabLibraryPreviewPage() {
  return <LibraryLandingVisualPreview />;
}
