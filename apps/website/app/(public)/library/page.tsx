import { createPageMetadataWithCanonical } from '@helpers/media/metadata/page-metadata.helper';
import LibraryContent from '@public/library/library-content';

export const generateMetadata = createPageMetadataWithCanonical(
  'Library',
  'A shared brand asset library for your whole team: images, videos, voices, music, captions, and moodboards, saved, searchable, and reusable.',
  '/library',
);

export default function Library() {
  return <LibraryContent />;
}
