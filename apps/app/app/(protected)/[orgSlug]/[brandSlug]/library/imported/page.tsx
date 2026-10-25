import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import ImportedLibrary from './imported-library';

export const generateMetadata = createPageMetadata('Imported');

export default function LibraryImportedPage() {
  return <ImportedLibrary />;
}
