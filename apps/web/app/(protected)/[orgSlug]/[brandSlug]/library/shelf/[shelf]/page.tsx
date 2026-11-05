import LibraryShelfRoute from '@app/(protected)/[orgSlug]/[brandSlug]/library/shelf/[shelf]/LibraryShelfRoute';
import { LIBRARY_SHELF_LABELS, parseLibraryShelf } from '@genfeedai/contracts';
import { createDynamicPageMetadata } from '@helpers/media/metadata/page-metadata.helper';

export const generateMetadata = createDynamicPageMetadata('shelf', (value) => {
  const parsed = parseLibraryShelf(value);

  return parsed ? LIBRARY_SHELF_LABELS[parsed] : 'Library';
});

export default function LibraryShelfPage() {
  return <LibraryShelfRoute />;
}
