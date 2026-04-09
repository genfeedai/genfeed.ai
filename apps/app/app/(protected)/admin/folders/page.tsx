import LazyLoadingFallback from '@components/loading/fallback/LazyLoadingFallback';
import { PageScope } from '@genfeedai/enums';
import { createPageMetadata } from '@helpers/media/metadata/page-metadata.helper';
import { Suspense } from 'react';
import FoldersList from './folders-list';

export const generateMetadata = createPageMetadata('Folders');

export default function FoldersPage() {
  return (
    <Suspense fallback={<LazyLoadingFallback variant="grid" />}>
      <FoldersList scope={PageScope.SUPERADMIN} />
    </Suspense>
  );
}
