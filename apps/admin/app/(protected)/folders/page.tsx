import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import FoldersList from '@pages/folders/folders-list';
import { PageScope } from '@ui-constants/misc.constant';
import { Suspense } from 'react';

export const generateMetadata = createPageMetadata('Folders');

export default function FoldersPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <FoldersList scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
