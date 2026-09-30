import LibraryContent from '@public/library/library-content';
import { createPageMetadataWithCanonical } from '@web-components/og/marketing-metadata';

export const generateMetadata = createPageMetadataWithCanonical(
  'Brand Asset Library for Content Teams',
  'A shared brand asset library for your whole team: images, videos, voices, music, captions, and moodboards, saved, searchable, and reusable.',
  '/library',
);

export default function Library() {
  return <LibraryContent />;
}
